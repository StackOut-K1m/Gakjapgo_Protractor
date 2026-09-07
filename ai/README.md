# AI — 거북목 판별 모델

정면 웹캠 영상에서 MediaPipe Pose로 좌표를 뽑아, 어깨 너비로 정규화한 비율 피처로
**거북목 여부를 판별하는 로지스틱 회귀 분류기**를 학습합니다.
학습 결과(계수 JSON)는 프론트엔드에서 실시간 추론에 사용합니다.

## 파이프라인

```
① 영상 촬영          good.mp4 (바른자세) / bad.mp4 (거북목)  ← 각 2분 정면
② train.ipynb        노트북에서 모듈 함수를 호출하며 진행:
                       - extract  : 영상 → 프레임별 Pose 좌표 CSV
                       - features : 좌표 → 정규화 피처
                       - train    : 로지스틱 회귀 학습 + 시각화 + 모델 JSON export
③ (프론트)           모델 JSON으로 브라우저에서 실시간 판별
```

학습은 **`train.ipynb` 노트북**에서 진행합니다. 무거운 로직은 `src/` 모듈에 두고
노트북은 그 함수들을 호출하며 그래프로 결과를 확인합니다.

## 환경 세팅

```bash
# miniforge 가상환경 (최초 1회)
conda create -n turtleneck python=3.11
conda activate turtleneck

# 패키지 설치
cd ai
pip install -r requirements.txt
```

## 사용법

### 1. 영상 준비
`data/raw/` 에 정면 웹캠 영상을 넣습니다. **파일명 앞글자로 라벨을 자동 인식**합니다.
- `good*.mp4` (예: `good_1.mp4`, `good_2.mp4`) — 바른 자세
- `bad*.mp4` (예: `bad_1.mp4`, `bad_2.mp4`) — 거북목 자세

> 여러 개를 넣을수록 데이터가 다양해져 일반화에 유리합니다.

### 2. 학습 (노트북)

`ai/train.ipynb` 를 열어 위에서부터 셀을 실행합니다.
(VS Code에서 열고 커널로 `turtleneck` 환경 선택)

- 영상 → 좌표 추출 (`extract_all()`, 느리면 `RUN_EXTRACT = False` 로 건너뛰기)
- 피처 분포 그래프 → **교차검증** → 학습·평가 → 가중치
- `THRESHOLD` 조정(0.4~0.6) 후 `models/turtleneck_model.json` 저장

> CLI로 한 번에 돌리고 싶으면: `cd src && python train.py` (교차검증·학습·export)
> 좌표 추출만: `cd src && python extract.py --all`
> 개별 영상만: `python extract.py --video ../data/raw/good_1.mp4 --label 0`

### 3. 웹캠으로 실시간 검증

학습한 모델이 잘 동작하는지 웹캠으로 눈으로 확인합니다.

```bash
cd src
python predict.py            # 기본 웹캠
python predict.py --camera 1 # 다른 카메라
```

- 화면에 실시간으로 `GOOD POSTURE`(초록) / `TURTLE NECK`(빨강) + 확률 표시
- `q` 키로 종료
- 추론 수식은 프론트(JS)와 동일 → 여기서 잘 되면 프론트 이식도 동일하게 동작

## 폴더 구조

```
ai/
├── data/
│   ├── raw/          # 원본 영상 (git 제외)
│   └── landmarks/    # 추출된 좌표 CSV (git 제외)
├── models/           # 학습된 모델 JSON
├── src/
│   ├── config.py     # 랜드마크 인덱스·피처 순서·경로
│   ├── features.py   # 좌표 → 정규화 피처 (학습·추론 공용 로직)
│   ├── extract.py    # 영상 → 좌표 CSV
│   └── train.py      # 학습 함수 모음 (노트북에서 호출)
├── train.ipynb       # 학습 진행 노트북 (메인 진입점)
└── requirements.txt
```

## 설계 메모

- **정규화**: 모든 거리를 어깨 너비로 나눠 카메라 거리·체격 차이에 강건하게.
- **정면 거북목 신호**: 얼굴/귀 간격 확대, 코·귀가 어깨선으로 하강, 코 z(깊이) 전진.
- **`features.py` 는 학습과 프론트 추론이 100% 동일한 계산을 쓰도록 단일 소스로 유지.**
- **한계**: 정면만으로는 전방 이동(z) 신호가 약함. 1인 데이터는 개인 과적합 위험 →
  추후 팀원 데이터로 일반화 필요.
```
