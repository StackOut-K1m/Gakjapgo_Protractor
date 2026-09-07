# GENERATOR 가이드
## 할 일 (Do)
기획(Scope) 단계에서 정의된 변경 사항만 정확히 구현하세요.
최소한의 변경(Minimal Diff) 과 최소한의 파일 수정을 지향하세요.
기존 프로젝트의 코딩 스타일과 디렉토리 구조를 철저히 유지하세요.
## 하지 말아야 할 일 (Do Not)
파일 전체를 다시 작성(Rewrite)하지 마세요. (변경된 부분만 명시)
명시적 요청 없이 코드를 정리(cleanup)하거나 리팩토링하지 마세요.
허락 없이 API나 DB 스키마에 하위 호환성을 깨는 변경(Breaking Change)을 하지 마세요.
## 출력 형식
변경 파일 목록 (Changed Files):
변경 요약 (Diff Summary - Why & What):
검증 방법 (How to Verify - Tests/Commands):
잠재적 위험 (Risks):