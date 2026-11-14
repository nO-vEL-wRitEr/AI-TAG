# AI-TAG 🎮 — OOP Edition

AI 술래잡기 6.0을 객체지향 JavaScript로 정리한 버전입니다. 정적 HTML/CSS/JS만 사용하므로 Vercel에 빌드 없이 배포 가능합니다.

## 실행
`index.html`을 로컬 웹 서버에서 열거나 Vercel 저장소를 연결하세요. Framework: **Other**, 빌드 명령은 비워 둡니다.

## OOP 클래스 구조
| 클래스 | 역할 |
|---|---|
| AITagGame | 게임 라이프사이클 및 외부 접근 |
| PlayerController | 방향키/터치 이동·아이템 수집 |
| EnemyDirector | 추격 AI 및 충돌 판정 |
| DifficultyDirector | 난이도 증가·폭주·릴레이 |
| CombatSystem | 스페이스바 공격·밀치기·쿨다운 |
| GPSController | GPS 위치·정확도·속도 검사 |
| CharacterMotionRig | 달리기 애니메이션·옷깃 흔들림 |

## 게임 기능
- 남자/여자 SD 캐릭터 선택. 사용자 제공 원본 캐릭터 이미지가 `src/artwork.js`에 포함됩니다.
- 키보드 WASD/방향키와 모바일 터치 조작.
- 60초 / 5분 / 무한 릴레이.
- 초능력 1(대시), 2(시간정지), 3(순간이동).
- 보통/카오스 난이도에서 SPACE 공격. 연습 난이도에서는 비활성화.
- AI 가속, 미니맵, 에너지 조각.
- GPS 모드는 실험 기능이며 안전한 지정 구역에서 걷기 용도로만 시험하세요. HTTPS 및 위치 접근 권한이 필요하고, 위치 정보는 게임 코드에서 서버로 전송하지 않습니다.

## 구조
```
index.html
styles.css
src/
  main.js        # OOP 게임 로직 · 캔버스 UI
  artwork.js     # 기존 캐릭터 원본 이미지
README.md
vercel.json
```

기존 6.0의 화면/게임 규칙은 유지하면서 핵심 동작을 책임별 클래스로 분리했습니다.
