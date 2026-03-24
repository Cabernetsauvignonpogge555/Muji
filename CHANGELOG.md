# Changelog

## [0.3.1] - 2026-03-24

### Fixed
- **BGM 다중 윈도우 중복 재생 방지**: 여러 Claude Code 윈도우에서 동시에 `/music`, `/focus`, `/timer` 등을 실행할 때 mpv 프로세스가 중복 실행되는 문제 수정
  - PID 파일 기반 글로벌 싱글톤 메커니즘 추가 (`muji-bgm.pid`)
  - 새 BGM 시작 전 기존 글로벌 mpv 프로세스를 감지하고 종료
  - mpv 종료/에러 시 PID 파일 자동 정리
  - `isPlayingGlobal()` 메서드 추가로 크로스 프로세스 상태 확인 가능
