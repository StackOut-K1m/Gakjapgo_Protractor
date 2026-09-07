"""턱 괴기(chin rest) 판정 테스트.

라운드숄더와 달리 이건 "자세의 정도"가 아니라 **일어났거나 안 일어났거나** 하는 동작이다.
그래서 접근을 바꿨다.

  - 학습 모델을 쓰지 않는다. 손이 턱 근처에 있는지는 좌표만으로 바로 나온다.
  - z 점수(개인 표준편차 대비)를 쓰지 않는다. 라운드숄더에서 5초 캘리브레이션의 표준편차가
    0.003 까지 내려가 z 가 폭발했던 문제를 되풀이하지 않으려는 것이다. 여기서는 어깨 너비로
    나눈 **절대 비율**을 쓴다. 사람이 달라도 "손목이 턱에서 어깨너비의 절반 안쪽"은 같은 뜻이다.
  - 캘리브레이션은 판정 기준이 아니라 **프레이밍 점검용**이다. 평소 자세(손을 책상에 둔 상태)의
    거리를 재 두고, 그 값이 이미 임계값 아래면 카메라가 손을 못 담고 있다는 뜻이라 경고한다.

정규화 기준을 얼굴 폭이 아니라 **어깨 너비**로 잡은 이유:
턱을 괴면 손이 턱·볼·귀를 가린다. 귀 좌표의 신뢰도가 떨어지는 바로 그 순간에 판정을 해야 하는데,
얼굴 폭을 기준으로 삼으면 기준자 자체가 흔들린다. 어깨는 턱 괴기로 가려지지 않는다.

턱 좌표는 Pose 에 없다. 눈 중점 → 입 중점 방향으로 얼굴 축을 만들어 그 아래로 연장해 추정한다.
고개를 기울이면 축도 같이 기울어서 따라간다.

임계값은 전부 잠정치다. 이 스크립트로 본인 웹캠에서 숫자를 보고 맞춰야 한다.

실행:
    python ai/src/chin_rest_calib_test.py

키:
    q  종료
    r  캘리브레이션 다시
"""

import time
from collections import deque

import cv2
import mediapipe as mp
import numpy as np

CALIB_SECONDS = 3.0      # 평소 자세 기록 시간. 판정 기준이 아니라 프레이밍 점검용이라 짧다
SMOOTH_FRAMES = 5        # 지표 이동평균 (랜드마크 떨림 완화)
MIN_VISIBILITY = 0.5     # 얼굴·어깨가 이 미만이면 판정 자체를 못 한다
HAND_VISIBILITY = 0.5    # 손목이 이 미만이면 "손이 안 보임"으로 따로 센다

# 손목~턱 거리(어깨너비 대비). 들어갈 때와 나올 때를 다르게 둬야 경계에서 깜빡이지 않는다.
# 0.32 는 얼굴 폭의 3분의 2쯤이다. 처음에 0.55 로 뒀더니 얼굴 폭의 한 배가 넘어서
# 손이 얼굴 근처 어디에 있든 걸렸다.
CHIN_NEAR = 0.32
CHIN_FAR = 0.45

# 손목이 턱보다 위로 이만큼(어깨너비 대비)까지만 올라가도 된다.
# 거리만 보면 입·코에 손을 대도 턱과 가까워서 걸린다. 턱 괴기는 손이 턱을 받치는 동작이라
# 손목이 턱 아래에 온다. 얼굴 축(눈→입 방향)에 투영해 위아래를 가른다.
ABOVE_CHIN_LIMIT = 0.06

# 팔꿈치가 어깨보다 이만큼(어깨너비 대비) 아래여야 "괴었다"로 본다.
# 책상에 팔꿈치를 짚는 동작이라 팔꿈치가 낮게 내려간다. 얼굴을 긁으려고 손만 올리면 덜 내려간다.
ELBOW_MIN_DROP = 0.15

HOLD_SECONDS = 30.0      # 이만큼 이어져야 확정. 서버 자세 판정의 관찰 구간(30초)과 같게 맞췄다
RELEASE_SECONDS = 1.0    # 손이 이만큼 떨어지면 누적을 끊는다. 그 안에 돌아오면 이어 간다

# 턱 위치 추정 계수. 입 중점에서 (입 중점 - 눈 중점) 방향으로 이만큼 더 내려간 곳.
CHIN_EXTEND = 0.7

# MediaPipe Pose 랜드마크 인덱스
IDX = {'left_eye': 2, 'right_eye': 5,
       'mouth_left': 9, 'mouth_right': 10,
       'left_shoulder': 11, 'right_shoulder': 12,
       'left_elbow': 13, 'right_elbow': 14,
       'left_wrist': 15, 'right_wrist': 16,
       # 턱에 닿는 것은 손목이 아니라 이쪽이다. 주먹을 쥐고 괴면 손목은 한 뼘 아래로 내려간다.
       'left_pinky': 17, 'right_pinky': 18,
       'left_index': 19, 'right_index': 20}

# 얼굴·몸통 기준점. 이게 안 보이면 아무것도 못 잰다
CORE_KEYS = ['left_eye', 'right_eye', 'mouth_left', 'mouth_right',
             'left_shoulder', 'right_shoulder']


def measure(pts):
    """랜드마크 → 지표. 거리는 전부 어깨 너비로 나눠 카메라 거리와 무관하게 만든다.

    pts: {이름: [x, y, z, visibility]} — 정규화 좌표(0~1)
    반환: 지표 dict, 또는 얼굴·어깨가 가려져서 못 재면 None
    """
    if any(pts[n][3] < MIN_VISIBILITY for n in CORE_KEYS):
        return None

    lsh, rsh = np.array(pts['left_shoulder'][:2]), np.array(pts['right_shoulder'][:2])
    sh_w = float(np.linalg.norm(lsh - rsh))
    if sh_w < 1e-6:
        return None

    eye_mid = (np.array(pts['left_eye'][:2]) + np.array(pts['right_eye'][:2])) / 2
    mouth_mid = (np.array(pts['mouth_left'][:2]) + np.array(pts['mouth_right'][:2])) / 2
    # 눈→입 방향을 그대로 연장해 턱을 잡는다. 고개를 기울이면 이 축도 같이 기운다.
    chin = mouth_mid + (mouth_mid - eye_mid) * CHIN_EXTEND

    sh_y = (lsh[1] + rsh[1]) / 2

    # 얼굴이 향하는 "아래" 방향 단위벡터. 고개를 기울여도 같이 기울어서, 화면의 아래가 아니라
    # 얼굴 기준의 아래로 위아래를 가를 수 있다.
    axis = mouth_mid - eye_mid
    axis_len = float(np.linalg.norm(axis))
    if axis_len < 1e-6:
        return None
    down = axis / axis_len

    out = {'sh_w': sh_w}
    for side in ('left', 'right'):
        wrist = pts[f'{side}_wrist']
        elbow = pts[f'{side}_elbow']
        # 손목·검지·새끼 중 턱에 가장 가까운 점까지를 잰다. 주먹이든 편 손이든
        # 실제로 턱에 닿는 부분을 잡기 위해서다. 손끝 점은 보일 때만 후보로 둔다.
        hand_pts = [wrist] + [pts[f'{side}_{n}'] for n in ('index', 'pinky')
                              if pts[f'{side}_{n}'][3] >= HAND_VISIBILITY]
        out[f'{side}_dist'] = min(
            float(np.linalg.norm(np.array(p[:2]) - chin)) for p in hand_pts) / sh_w
        # 턱→손목 벡터를 얼굴 축에 투영한다. 축 방향(아래)이면 양수라 부호를 뒤집어야
        # "턱보다 위"가 양수가 된다.
        out[f'{side}_above'] = -float(np.dot(np.array(wrist[:2]) - chin, down)) / sh_w
        # 아래로 갈수록 y 가 커진다. 팔꿈치가 어깨보다 아래면 양수
        out[f'{side}_drop'] = float(elbow[1] - sh_y) / sh_w
        out[f'{side}_vis'] = float(wrist[3])
        out[f'{side}_elbow_vis'] = float(elbow[3])

    return out


def nearer_side(m):
    """손목이 턱에 더 가까운 쪽. 보이지 않는 손은 후보에서 뺀다."""
    seen = [s for s in ('left', 'right') if m[f'{s}_vis'] >= HAND_VISIBILITY]
    if not seen:
        return None
    return min(seen, key=lambda s: m[f'{s}_dist'])


def judge(m, active):
    """지금 프레임이 턱 괴기인지.

    active: 직전까지 괴고 있던 상태인지. 히스테리시스에 쓴다.
    반환: (후보 여부, 사유 문자열, 판정에 쓴 쪽)
    """
    side = nearer_side(m)
    if side is None:
        # 손이 안 보이는 것과 손을 안 괸 것은 다르다. 여기서 뭉개면 프레이밍 문제를 못 잡는다.
        return False, 'HAND NOT VISIBLE', None

    dist = m[f'{side}_dist']
    limit = CHIN_FAR if active else CHIN_NEAR
    if dist > limit:
        return False, f'hand away ({dist:.2f} > {limit:.2f})', side

    # 입·코를 만지는 손은 턱보다 위에 있다. 턱을 괸 손은 턱을 받치므로 아래에 온다.
    above = m[f'{side}_above']
    if above > ABOVE_CHIN_LIMIT:
        return False, f'hand above chin ({above:+.2f}) - mouth/nose', side

    # 팔꿈치가 화면 밖이면(책상에 잘려서) 이 조건은 못 본다. 손목만으로 판단한다.
    elbow_seen = m[f'{side}_elbow_vis'] >= HAND_VISIBILITY
    if elbow_seen and m[f'{side}_drop'] < ELBOW_MIN_DROP:
        return False, f'elbow high ({m[f"{side}_drop"]:.2f})', side

    return True, 'chin supported', side


class Sustain:
    """짧게 얼굴을 만지는 것과 계속 괴고 있는 것을 시간으로 가른다."""

    def __init__(self):
        self.active = False
        self.since = None      # 후보가 이어지기 시작한 시각
        self.clear_since = None  # 후보가 끊긴 시각

    def update(self, candidate, now):
        # 후보가 아닌 프레임 한 장에 누적을 버리면 안 된다. 초당 수십 번 판정하는데 손이 살짝
        # 움직이거나 랜드마크가 튀기만 해도 끊기고, 그러면 HOLD_SECONDS(30초)를 채울 수 없다.
        # RELEASE_SECONDS 안에 손이 돌아오면 이어 간다.
        if candidate:
            self.clear_since = None
            if self.since is None:
                self.since = now
        elif self.since is not None:
            if self.clear_since is None:
                self.clear_since = now
            elif now - self.clear_since >= RELEASE_SECONDS:
                self.since = None
                self.clear_since = None
                self.active = False

        if not self.active and self.since is not None and now - self.since >= HOLD_SECONDS:
            self.active = True
        return self.active

    def progress(self, now):
        """확정까지 얼마나 왔는지 0~1. 화면에 진행 막대로 그린다."""
        if self.active or self.since is None:
            return 1.0 if self.active else 0.0
        return min(1.0, (now - self.since) / HOLD_SECONDS)


def run_webcam():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError('웹캠을 열 수 없습니다.')

    pose = mp.solutions.pose.Pose(model_complexity=2,  # 프론트 heavy 와 맞춤
                                  min_detection_confidence=0.5,
                                  min_tracking_confidence=0.5)

    smooth_keys = ['left_dist', 'right_dist', 'left_above', 'right_above',
                   'left_drop', 'right_drop']
    smooth = {k: deque(maxlen=SMOOTH_FRAMES) for k in smooth_keys}
    sustain = Sustain()

    started = time.time()
    calib = []          # 평소 자세의 손목~턱 거리
    calib_ref = None    # 굳힌 평소값
    frames = hidden = 0  # 손이 안 보인 프레임 비율 — 이 방식이 쓸 만한지 가르는 숫자다

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame = cv2.flip(frame, 1)
            result = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

            m = None
            if result.pose_landmarks:
                lms = result.pose_landmarks.landmark
                pts = {n: [lms[i].x, lms[i].y, lms[i].z, lms[i].visibility]
                       for n, i in IDX.items()}
                raw = measure(pts)
                if raw is not None:
                    for k in smooth_keys:
                        smooth[k].append(raw[k])
                    m = dict(raw)
                    for k in smooth_keys:
                        m[k] = float(np.mean(smooth[k]))

            now = time.time()
            if calib_ref is None:
                if m is not None:
                    side = nearer_side(m)
                    if side is not None:
                        calib.append(m[f'{side}_dist'])
                remain = max(0.0, CALIB_SECONDS - (now - started))
                # OpenCV 기본 폰트는 한글을 못 그린다(전부 ? 로 나온다). 화면 문구는 영어로 둔다.
                _banner(frame, f'CALIBRATING...  {remain:.1f}s', (0, 165, 255))
                cv2.putText(frame, 'sit normally - hands on the desk, do NOT touch your face',
                            (20, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
                if remain <= 0:
                    calib_ref = float(np.mean(calib)) if calib else None
                    started = now
            elif m is None:
                _banner(frame, 'NO LANDMARKS', (0, 0, 255))
            else:
                frames += 1
                candidate, reason, side = judge(m, sustain.active)
                if side is None:
                    hidden += 1
                active = sustain.update(candidate, now)

                if active:
                    label, color = 'CHIN REST', (0, 0, 255)
                elif candidate:
                    label, color = 'CHIN REST?  holding...', (0, 165, 255)
                elif side is None:
                    label, color = 'HAND NOT VISIBLE', (150, 150, 150)
                else:
                    label, color = 'OK', (0, 200, 0)
                _banner(frame, label, color)

                # 어느 숫자 때문에 이렇게 판정됐는지 보여야 임계값을 조정할 수 있다.
                lines = [
                    f'L dist {m["left_dist"]:.2f}  above {m["left_above"]:+.2f}'
                    f'  drop {m["left_drop"]:+.2f}  vis {m["left_vis"]:.2f}',
                    f'R dist {m["right_dist"]:.2f}  above {m["right_above"]:+.2f}'
                    f'  drop {m["right_drop"]:+.2f}  vis {m["right_vis"]:.2f}',
                    f'enter<{CHIN_NEAR}  exit>{CHIN_FAR}'
                    f'  above<{ABOVE_CHIN_LIMIT}  elbow drop>{ELBOW_MIN_DROP}',
                    f'reason: {reason}',
                ]
                for i, text in enumerate(lines):
                    cv2.putText(frame, text, (20, 110 + i * 26),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

                base_y = 110 + len(lines) * 26
                if calib_ref is not None:
                    warn = calib_ref < CHIN_NEAR
                    cv2.putText(frame,
                                f'neutral {calib_ref:.2f}'
                                + ('  <- TOO LOW: camera cannot see your hands properly' if warn else ''),
                                (20, base_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                                (0, 0, 255) if warn else (200, 200, 100), 1)
                else:
                    cv2.putText(frame, 'neutral: n/a (hands never visible during calibration)',
                                (20, base_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 1)

                # 손이 안 보인 비율. 이게 높으면 손목 기반 판정 자체가 성립하지 않는다.
                if frames:
                    cv2.putText(frame, f'hand hidden {hidden / frames * 100:.0f}% of frames',
                                (20, base_y + 26), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                                (200, 200, 100), 1)

                # 확정까지 남은 시간을 막대로. 몇 초 버텨야 잡히는지 눈으로 보여야 한다.
                p = sustain.progress(now)
                cv2.rectangle(frame, (20, base_y + 44), (20 + int(300 * p), base_y + 56),
                              color, -1)
                cv2.rectangle(frame, (20, base_y + 44), (320, base_y + 56), (255, 255, 255), 1)

            cv2.putText(frame, 'q: quit   r: recalibrate', (20, frame.shape[0] - 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
            cv2.imshow('chin rest test', frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            if key == ord('r'):
                calib, calib_ref = [], None
                sustain = Sustain()
                frames = hidden = 0
                started = time.time()
    finally:
        cap.release()
        pose.close()
        cv2.destroyAllWindows()

    if frames:
        print(f'총 {frames} 프레임 중 손이 안 보인 프레임 {hidden} '
              f'({hidden / frames * 100:.1f}%)')


def _banner(frame, text, color):
    cv2.rectangle(frame, (10, 20), (620, 80), (0, 0, 0), -1)
    cv2.putText(frame, text, (20, 62), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)


if __name__ == '__main__':
    run_webcam()
