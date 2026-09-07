# YOLOv11s 휴대폰 실시간 감지 테스트 (웹캠)
#
# 실행: python phone_detect_webcam.py
#   - 첫 실행 시 yolo11s.pt(~19MB)가 자동 다운로드되어 ai/models/ 에 저장됩니다.
#   - 초록 박스: 휴대폰 감지 (신뢰도 표시)
#   - 좌상단 상태: 연속 감지 프레임 수 / "PHONE CONFIRMED" (디바운싱 통과)
#   - 종료: q
import time
from pathlib import Path

import cv2
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]  # ai/
MODELS_DIR = ROOT / "models"
MODEL_PATH = MODELS_DIR / "yolo11s.pt"

CELL_PHONE_CLASS = 67  # COCO 클래스 67 = cell phone
CONF_THRESHOLD = 0.75   # 신뢰도 임계값 (오탐 많으면 올리고, 못 잡으면 내리세요) 0.75가 적당한듯
CONFIRM_FRAMES = 15    # 연속 N프레임 감지 시 "확정" (azekowka/phone-detector 참고)


def load_model() -> YOLO:
    MODELS_DIR.mkdir(exist_ok=True)
    if MODEL_PATH.exists():
        return YOLO(str(MODEL_PATH))
    # 최초 1회: 현재 폴더에 자동 다운로드 후 ai/models/ 로 이동
    model = YOLO("yolo11s.pt")
    downloaded = Path("yolo11s.pt")
    if downloaded.exists():
        downloaded.rename(MODEL_PATH)
        model = YOLO(str(MODEL_PATH))
    return model


def main() -> None:
    model = load_model()
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("웹캠을 열 수 없습니다. 다른 앱이 카메라를 쓰고 있는지 확인하세요.")
        return

    consecutive = 0
    confirmed = False
    prev_time = time.time()

    print("웹캠 감지 시작 — 휴대폰을 화면에 들어보세요. 종료: q")
    while True:
        ok, frame = cap.read()
        if not ok:
            break

        results = model(frame, classes=[CELL_PHONE_CLASS], conf=CONF_THRESHOLD, verbose=False)
        boxes = results[0].boxes

        # 디바운싱: 연속 감지 프레임 카운트
        if len(boxes) > 0:
            consecutive += 1
        else:
            consecutive = 0
        confirmed = consecutive >= CONFIRM_FRAMES

        # 감지 박스 그리기
        for box in boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 200, 0), 2)
            cv2.putText(frame, f"cell phone {conf:.2f}", (x1, y1 - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 0), 2)

        # FPS 계산
        now = time.time()
        fps = 1.0 / (now - prev_time) if now > prev_time else 0.0
        prev_time = now

        # 상태 표시
        status = f"PHONE CONFIRMED ({consecutive}f)" if confirmed else f"detecting... {consecutive}/{CONFIRM_FRAMES}"
        color = (0, 0, 255) if confirmed else (200, 200, 200)
        cv2.putText(frame, status, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
        cv2.putText(frame, f"FPS {fps:.1f} | conf>={CONF_THRESHOLD}", (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

        cv2.imshow("Phone Detection Test (q: quit)", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
