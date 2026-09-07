# 스트레칭 판정 모듈 — neckStrech1~4 / shoulderStrech1~3 의 판정 로직을 클래스로 재구성.
#
# 공통 인터페이스:
#   detector.process(pose_landmarks, w, h, now) -> completed_count 증가 여부
#   detector.reps            누적 완료 횟수
#   detector.status_text     현재 안내 문구 (콘솔 출력용)
#
# 세션 모니터가 Pose 를 한 번만 돌리고 랜드마크를 넘겨준다 (모델 중복 실행 방지).
import time
from collections import deque

import mediapipe as mp
import numpy as np

P = mp.solutions.pose.PoseLandmark
FM_RIGHT_EYE_OUTER, FM_LEFT_EYE_OUTER = 33, 263  # FaceMesh 인덱스 (참고용)


def xy(lm, idx, w, h) -> np.ndarray:
    return np.array([lm[idx].x * w, lm[idx].y * h])


class StretchBase:
    """스트레칭 판정 공통 베이스."""
    name = "stretch"
    target_part = "NECK"
    hold_seconds = 3.0
    calib_seconds = 2.0

    def __init__(self, target_reps: int = 2) -> None:
        self.target_reps = target_reps
        self.reps = 0
        self.status_text = "준비 중"
        self._calib_start = None
        self._calib_samples: list = []
        self._ready = False

    @property
    def done(self) -> bool:
        return self.reps >= self.target_reps

    def reset(self) -> None:
        self.reps = 0
        self._calib_start = None
        self._calib_samples = []
        self._ready = False
        self.status_text = "준비 중"

    def process(self, lm, w: int, h: int, now: float) -> bool:
        raise NotImplementedError


class NeckLateralTilt(StretchBase):
    """목 옆으로 기울이기 (neckStrech1) — 좌우 각각 유지."""
    name = "목 옆으로 기울이기"
    target_part = "NECK"
    TILT_TARGET_DEG = 18.0
    RETURN_DEG = 8.0

    def __init__(self, target_reps: int = 2, hold_seconds: float = 3.0) -> None:
        super().__init__(target_reps)
        self.hold_seconds = hold_seconds
        self._window: deque[float] = deque(maxlen=5)
        self._baseline = None
        self._state = "NEUTRAL"
        self._side = None
        self._hold_start = None
        self._need_return = False
        self._sides_done = set()

    @staticmethod
    def _roll_deg(lm, w, h) -> float:
        # Pose 의 눈 바깥 랜드마크로 머리 roll 계산
        p1 = xy(lm, P.RIGHT_EYE_OUTER, w, h)
        p2 = xy(lm, P.LEFT_EYE_OUTER, w, h)
        d = p2 - p1
        return float(np.degrees(np.arctan2(d[1], d[0])))

    def process(self, lm, w, h, now) -> bool:
        self._window.append(self._roll_deg(lm, w, h))
        roll = float(np.mean(self._window))

        if self._baseline is None:
            self._calib_start = self._calib_start or now
            self._calib_samples.append(roll)
            remain = self.calib_seconds - (now - self._calib_start)
            if remain <= 0:
                self._baseline = float(np.median(self._calib_samples))
                self.status_text = "머리를 어깨 쪽으로 기울이세요"
            else:
                self.status_text = f"기준 측정 중... 정면 응시 ({remain:.1f}s)"
            return False

        dev = roll - self._baseline
        side = "LEFT" if dev < 0 else "RIGHT"
        mag = abs(dev)

        if self._need_return:
            self.status_text = "좋습니다! 정면으로 돌아오세요"
            if mag < self.RETURN_DEG:
                self._need_return = False
                self._state = "NEUTRAL"
            return False

        if mag >= self.TILT_TARGET_DEG:
            if self._state != "TILTING" or side != self._side:
                self._state, self._side, self._hold_start = "TILTING", side, now
            held = now - self._hold_start
            self.status_text = f"{side} 유지 {held:.1f}/{self.hold_seconds:.0f}s"
            if held >= self.hold_seconds:
                self.reps += 1
                self._sides_done.add(side)
                self._need_return = True
                return True
        else:
            self._state, self._side, self._hold_start = "NEUTRAL", None, None
            self.status_text = f"머리를 어깨 쪽으로 기울이세요 (현재 {mag:.0f}도)"
        return False


class NeckDiagonal(StretchBase):
    """대각선 목 스트레칭 (neckStrech3) — 45도 돌려 숙이기."""
    name = "대각선 목 스트레칭"
    target_part = "NECK"
    X_MIN, Y_MIN = 0.10, 0.12
    YAW_SHRINK = 0.85
    NEUTRAL_R = 0.08
    HOLD_GRACE = 0.8

    def __init__(self, target_reps: int = 2, hold_seconds: float = 3.0) -> None:
        super().__init__(target_reps)
        self.hold_seconds = hold_seconds
        self._window: deque[np.ndarray] = deque(maxlen=4)
        self._center = None
        self._earw_base = None
        self._state = "NEUTRAL"
        self._side = None
        self._hold_start = None
        self._broken_since = None

    def process(self, lm, w, h, now) -> bool:
        nose = xy(lm, P.NOSE, w, h)
        ear_l, ear_r = xy(lm, P.LEFT_EAR, w, h), xy(lm, P.RIGHT_EAR, w, h)
        sh_l, sh_r = xy(lm, P.LEFT_SHOULDER, w, h), xy(lm, P.RIGHT_SHOULDER, w, h)
        shoulder_w = float(np.linalg.norm(sh_l - sh_r))
        if shoulder_w < 1:
            return False
        rel = (nose - (sh_l + sh_r) / 2) / shoulder_w
        self._window.append(rel)
        rel_s = np.mean(self._window, axis=0)
        earw = float(np.linalg.norm(ear_r - ear_l) / shoulder_w)

        if self._center is None:
            self._calib_start = self._calib_start or now
            self._calib_samples.append((rel, earw))
            remain = self.calib_seconds - (now - self._calib_start)
            if remain <= 0:
                self._center = np.median(np.array([c[0] for c in self._calib_samples]), axis=0)
                self._earw_base = float(np.median([c[1] for c in self._calib_samples]))
                self.status_text = "고개를 45도 돌린 뒤 대각선 아래로 숙이세요"
            else:
                self.status_text = f"기준 측정 중... 정면 응시 ({remain:.1f}s)"
            return False

        v = rel_s - self._center
        turned = earw < self._earw_base * self.YAW_SHRINK
        side = "LEFT" if v[0] < -self.X_MIN else "RIGHT" if v[0] > self.X_MIN else None
        ok = turned and v[1] > self.Y_MIN and side is not None

        if self._state == "NEUTRAL":
            self.status_text = ("고개를 45도 돌린 뒤 대각선 아래로 숙이세요"
                                + ("" if turned else " (고개를 더 돌리세요)"))
            if ok:
                self._state, self._side, self._hold_start = "HOLDING", side, now
                self._broken_since = None
        elif self._state == "HOLDING":
            held = now - self._hold_start
            self.status_text = f"{self._side} 유지 {held:.1f}/{self.hold_seconds:.0f}s"
            if ok and side == self._side:
                self._broken_since = None
            else:
                self._broken_since = self._broken_since or now
            if self._broken_since and (now - self._broken_since) >= self.HOLD_GRACE:
                self._state, self._side, self._hold_start = "NEUTRAL", None, None
            elif held >= self.hold_seconds:
                self.reps += 1
                self._state, self._side, self._hold_start = "RETURN", None, None
                return True
        else:  # RETURN
            self.status_text = "좋습니다! 정면으로 돌아오세요"
            if float(np.linalg.norm(v)) < self.NEUTRAL_R:
                self._state = "NEUTRAL"
        return False


class ShoulderShrug(StretchBase):
    """어깨 으쓱 (neckStrech4) — 올렸다 내리면 1회."""
    name = "어깨 으쓱"
    target_part = "SHOULDER"
    SHRUG_MIN, BOTH_MIN = 0.08, 0.05
    RETURN_RATIO = 0.4
    HEAD_STILL_MAX = 0.07
    HOLD_GRACE = 0.6

    def __init__(self, target_reps: int = 3, hold_seconds: float = 2.0) -> None:
        super().__init__(target_reps)
        self.hold_seconds = hold_seconds
        self._window: deque[float] = deque(maxlen=4)
        self._base = None       # (gap, gap_l, gap_r, pitch)
        self._state = "DOWN"
        self._hold_start = None
        self._broken_since = None

    @staticmethod
    def _metrics(lm, w, h):
        nose = xy(lm, P.NOSE, w, h)
        ear_l, ear_r = xy(lm, P.LEFT_EAR, w, h), xy(lm, P.RIGHT_EAR, w, h)
        ear_mid = (ear_l + ear_r) / 2
        sh_l, sh_r = xy(lm, P.LEFT_SHOULDER, w, h), xy(lm, P.RIGHT_SHOULDER, w, h)
        sw = float(np.linalg.norm(sh_l - sh_r))
        if sw < 1:
            return None
        return (
            float(((sh_l[1] + sh_r[1]) / 2 - ear_mid[1]) / sw),
            float((sh_l[1] - ear_l[1]) / sw),
            float((sh_r[1] - ear_r[1]) / sw),
            float((nose[1] - ear_mid[1]) / sw),
        )

    def process(self, lm, w, h, now) -> bool:
        m = self._metrics(lm, w, h)
        if m is None:
            return False
        gap, gap_l, gap_r, pitch = m
        self._window.append(gap)
        gap_s = float(np.mean(self._window))

        if self._base is None:
            self._calib_start = self._calib_start or now
            self._calib_samples.append(m)
            remain = self.calib_seconds - (now - self._calib_start)
            if remain <= 0:
                arr = np.array(self._calib_samples)
                self._base = tuple(np.median(arr, axis=0))
                self.status_text = "양 어깨를 귀 쪽으로 올리세요"
            else:
                self.status_text = f"기준 측정 중... 어깨 힘 빼기 ({remain:.1f}s)"
            return False

        b_gap, b_l, b_r, b_pitch = self._base
        rise, rise_l, rise_r = b_gap - gap_s, b_l - gap_l, b_r - gap_r
        head_still = abs(pitch - b_pitch) < self.HEAD_STILL_MAX
        up = rise > self.SHRUG_MIN and rise_l > self.BOTH_MIN and rise_r > self.BOTH_MIN and head_still
        released = rise < self.SHRUG_MIN * self.RETURN_RATIO

        if self._state == "DOWN":
            self.status_text = ("양 어깨를 귀 쪽으로 올리세요"
                                + ("" if head_still else " (머리는 그대로!)"))
            if up:
                self._state, self._hold_start, self._broken_since = "UP", now, None
        else:  # UP
            held = now - self._hold_start
            if up:
                self._broken_since = None
            else:
                self._broken_since = self._broken_since or now
            if self._broken_since and (now - self._broken_since) >= self.HOLD_GRACE and held < self.hold_seconds:
                self._state, self._hold_start = "DOWN", None
                self.status_text = "양 어깨를 귀 쪽으로 올리세요"
            elif held >= self.hold_seconds:
                self.status_text = "좋습니다! 어깨를 내리세요"
                if released:
                    self.reps += 1
                    self._state, self._hold_start = "DOWN", None
                    return True
            else:
                self.status_text = f"유지 {held:.1f}/{self.hold_seconds:.0f}s"
        return False


class ShoulderCrossBody(StretchBase):
    """크로스바디 (shoulderStrech1) — 팔을 가슴 앞으로 가로질러 유지."""
    name = "크로스바디 어깨 스트레칭"
    target_part = "SHOULDER"
    HEIGHT_BAND = 0.55
    VIS_MIN = 0.5
    HOLD_GRACE = 0.6

    def __init__(self, target_reps: int = 2, hold_seconds: float = 3.0) -> None:
        super().__init__(target_reps)
        self.hold_seconds = hold_seconds
        self._state = "NEUTRAL"
        self._side = None
        self._hold_start = None
        self._broken_since = None

    def _crossing(self, lm, w, h):
        sh_l, sh_r = xy(lm, P.LEFT_SHOULDER, w, h), xy(lm, P.RIGHT_SHOULDER, w, h)
        wr_l, wr_r = xy(lm, P.LEFT_WRIST, w, h), xy(lm, P.RIGHT_WRIST, w, h)
        sw = float(np.linalg.norm(sh_l - sh_r))
        if sw < 1:
            return None
        mid_y = (sh_l[1] + sh_r[1]) / 2
        for wrist, own, oth, vis in (
            (wr_l, sh_l, sh_r, lm[P.LEFT_WRIST].visibility),
            (wr_r, sh_r, sh_l, lm[P.RIGHT_WRIST].visibility),
        ):
            label = "LEFT" if own[0] < oth[0] else "RIGHT"
            direction = 1.0 if oth[0] > own[0] else -1.0
            beyond = float((wrist[0] - oth[0]) * direction / sw)
            if vis > self.VIS_MIN and beyond > 0 and abs(wrist[1] - mid_y) < sw * self.HEIGHT_BAND:
                return label
        return None

    def process(self, lm, w, h, now) -> bool:
        crossing = self._crossing(lm, w, h)

        if self._state == "NEUTRAL":
            self.status_text = "한쪽 팔을 가슴 앞으로 가로질러 뻗으세요"
            if crossing:
                self._state, self._side, self._hold_start = "HOLDING", crossing, now
                self._broken_since = None
        elif self._state == "HOLDING":
            held = now - self._hold_start
            self.status_text = f"{self._side} 팔 유지 {held:.1f}/{self.hold_seconds:.0f}s"
            if crossing == self._side:
                self._broken_since = None
            else:
                self._broken_since = self._broken_since or now
            if self._broken_since and (now - self._broken_since) >= self.HOLD_GRACE:
                self._state, self._side, self._hold_start = "NEUTRAL", None, None
            elif held >= self.hold_seconds:
                self.reps += 1
                self._state, self._side, self._hold_start = "RETURN", None, None
                return True
        else:  # RETURN
            self.status_text = "좋습니다! 팔을 푸세요"
            if crossing is None:
                self._state = "NEUTRAL"
        return False


# 스트레칭 레지스트리 — DB stretchings 테이블에 대응
NECK_STRETCHES = [NeckLateralTilt, NeckDiagonal]
SHOULDER_STRETCHES = [ShoulderShrug, ShoulderCrossBody]
