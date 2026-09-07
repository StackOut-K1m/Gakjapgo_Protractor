# 감지기 모듈 — 기존 단독 스크립트(drowsiness/phone)의 판정 로직을 클래스로 재구성.
#
# 설계:
#   - 각 감지기는 웹캠을 직접 열지 않는다. 세션 모니터가 준 프레임만 처리한다.
#   - 화면에 그리지 않는다. 상태 변화 시 "이벤트"만 반환한다.
#     → 이벤트 형식은 API 명세의 POST /study-sessions/{id}/posture-checks 바디에 맞춘다.
#   - 실행 주기가 다르다: 졸음은 매 프레임, 폰은 무거워서 PHONE_INTERVAL 초당 1회.
#
# 실서비스(FE) 이식 시 이 판정 로직이 그대로 사양이 된다.
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np


@dataclass
class DetectionEvent:
    """감지 이벤트 (POST .../posture-checks 바디 대응)."""
    event_type: str            # DROWSY | PHONE | POSTURE | UNRECOGNIZED
    detail: str                # EYES_CLOSED | CELL_PHONE | TURTLE_NECK | AWAY ...
    started_at: float
    ended_at: float | None = None
    duration_seconds: float | None = None
    severity: int = 1
    metadata: dict = field(default_factory=dict)

    def as_api_body(self) -> dict:
        return {
            "eventType": self.event_type,
            "detail": self.detail,
            "severity": self.severity,
            "startedAt": self.started_at,
            "endedAt": self.ended_at,
            "durationSeconds": self.duration_seconds,
            "metadata": self.metadata,
        }


# ── 졸음 감지 (FaceMesh EAR + 자동 캘리브레이션) ──────────────
class DrowsinessDetector:
    CALIB_SECONDS = 3.0
    EAR_CLOSE_RATIO = 0.75
    EAR_MIN_FLOOR = 0.10
    DROWSY_SECONDS = 2.0
    NO_FACE_SECONDS = 3.0
    SMOOTH_FRAMES = 3

    LEFT_EYE = [33, 160, 158, 133, 153, 144]
    RIGHT_EYE = [362, 385, 387, 263, 373, 380]

    def __init__(self) -> None:
        self._mesh = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=1, refine_landmarks=True,
            min_detection_confidence=0.5, min_tracking_confidence=0.5,
        )
        self._calib_start = None
        self._calib: list[float] = []
        self.baseline: float | None = None
        self.threshold: float | None = None
        self._window: deque[float] = deque(maxlen=self.SMOOTH_FRAMES)
        self._closed_since = None
        self._face_missing_since = None
        self._drowsy_reported = False   # 한 번 감김에 이벤트 1개만
        self._away_reported = False
        self.last_ear: float | None = None

    @staticmethod
    def _aspect_ratio(pts: np.ndarray) -> float:
        v1 = np.linalg.norm(pts[1] - pts[5])
        v2 = np.linalg.norm(pts[2] - pts[4])
        h = np.linalg.norm(pts[0] - pts[3])
        return (v1 + v2) / (2.0 * h) if h > 0 else 0.0

    @property
    def calibrating(self) -> bool:
        return self.baseline is None

    def process(self, frame, now: float) -> list[DetectionEvent]:
        events: list[DetectionEvent] = []
        res = self._mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        h, w = frame.shape[:2]

        if not res.multi_face_landmarks:
            self._closed_since = None
            self._face_missing_since = self._face_missing_since or now
            if (now - self._face_missing_since) >= self.NO_FACE_SECONDS and not self._away_reported:
                self._away_reported = True
                events.append(DetectionEvent(
                    "UNRECOGNIZED", "AWAY", self._face_missing_since,
                    duration_seconds=now - self._face_missing_since,
                ))
            return events

        self._face_missing_since = None
        self._away_reported = False
        lm = res.multi_face_landmarks[0].landmark

        def pts(idx):
            return np.array([[lm[i].x * w, lm[i].y * h] for i in idx])

        raw = (self._aspect_ratio(pts(self.LEFT_EYE)) + self._aspect_ratio(pts(self.RIGHT_EYE))) / 2
        self._window.append(raw)
        ear = float(np.mean(self._window))
        self.last_ear = ear

        # 캘리브레이션 (눈 뜬 상태 기준선)
        if self.baseline is None:
            self._calib_start = self._calib_start or now
            self._calib.append(raw)
            if now - self._calib_start >= self.CALIB_SECONDS:
                self.baseline = float(np.median(self._calib))
                self.threshold = max(self.baseline * self.EAR_CLOSE_RATIO, self.EAR_MIN_FLOOR)
            return events

        # 눈 감김 지속시간 판정
        if ear < self.threshold:
            self._closed_since = self._closed_since or now
            closed_for = now - self._closed_since
            if closed_for >= self.DROWSY_SECONDS and not self._drowsy_reported:
                self._drowsy_reported = True
                events.append(DetectionEvent(
                    "DROWSY", "EYES_CLOSED", self._closed_since,
                    duration_seconds=closed_for,
                    metadata={"ear": round(ear, 3), "baseline": round(self.baseline, 3)},
                ))
        else:
            self._closed_since = None
            self._drowsy_reported = False
        return events

    def close(self) -> None:
        self._mesh.close()


# ── 휴대폰 감지 (YOLOv11s, COCO cell phone) ───────────────────
class PhoneDetector:
    CELL_PHONE_CLASS = 67
    CONF_THRESHOLD = 0.75
    CONFIRM_FRAMES = 5        # 검사 프레임 기준 (매 프레임이 아니라 주기 실행)
    INTERVAL_SECONDS = 0.5    # 이 간격으로만 추론 (무거운 모델이라 부하 분산)
    COOLDOWN_SECONDS = 10.0   # 같은 폰 사용에 이벤트 중복 방지

    def __init__(self, model_path: Path | None = None) -> None:
        from ultralytics import YOLO

        default = Path(__file__).resolve().parents[2] / "models" / "yolo11s.pt"
        path = model_path or (default if default.exists() else Path("yolo11s.pt"))
        self._model = YOLO(str(path))
        self._last_run = 0.0
        self._consecutive = 0
        self._last_event_at = 0.0
        self.detected = False
        self.last_conf = 0.0

    def process(self, frame, now: float) -> list[DetectionEvent]:
        if now - self._last_run < self.INTERVAL_SECONDS:
            return []
        self._last_run = now

        res = self._model(frame, classes=[self.CELL_PHONE_CLASS],
                          conf=self.CONF_THRESHOLD, verbose=False)
        boxes = res[0].boxes
        if len(boxes) > 0:
            self._consecutive += 1
            self.last_conf = float(boxes.conf.max())
        else:
            self._consecutive = 0
            self.last_conf = 0.0
        self.detected = self._consecutive >= self.CONFIRM_FRAMES

        if self.detected and (now - self._last_event_at) >= self.COOLDOWN_SECONDS:
            self._last_event_at = now
            return [DetectionEvent(
                "PHONE", "CELL_PHONE", now,
                metadata={"confidence": round(self.last_conf, 3)},
            )]
        return []
