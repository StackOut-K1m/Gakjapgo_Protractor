1초마다 도는 전체 흐름

[브라우저] 1초마다
  posture-lab.html  extractFeatures()      → v1 피처 10개
                    extractMlFeatures()    → ml 피처 9개 (블록)
        │  POST /api/v1/study-sessions/{sessionId}/posture-frames
        ↓
[Spring]
  PostureController.analyze()              ← @Valid 로 요청 검증
        ↓
  PostureAnalysisService.analyze()         ← 흐름 전체를 묶는 곳
   ├─ ① studyRecordRepository.findById()   세션 확인
   ├─ ② calibrationService.getBaseline()   이 회원의 기준선
   ├─ ③ detector.detect(features, baseline)  ★ 판정 — 여기가 교체 지점
   ├─ ④ tracker.apply(...)                 30초 윈도우에 넣고 상태 변화만 받음
   ├─ ⑤ openEvent() / closeEvent()         확정·해소된 것만 events 저장
   └─ ⑥ PostureFrameResponse.of(...)       응답



단계	           파일
입구	           PostureController.java:50
흐름 조립	        PostureAnalysisService.java:71
③ 판정 인터페이스	 PostureDetector.java
④ 30초 지속 판정	PostureWindowTracker.java:65
⑤ 저장	           PostureAnalysisService.java:114
