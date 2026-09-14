# GitHub Pages + Firebase 배포

## 현재 운영 환경

- 앱: https://dave915.github.io/kakao-hr-workshop/
- 저장소: https://github.com/dave915/kakao-hr-workshop (공개)
- Firebase: `kakao-hr-workshop-915`, `asia-northeast3`
- 최초 슈퍼 어드민: `dave.h`. 개인 링크는 저장소에 포함하지 않습니다.
- 런타임: `workshop-runtime@kakao-hr-workshop-915.iam.gserviceaccount.com`. Firestore 쓰기, FCM 발송 및 자기 계정의 토큰 서명에 필요한 권한을 적용했습니다.
- Functions는 최대 인스턴스 3개로 설정했습니다. Artifact Registry의 빌드 이미지는 7일 보관 후 정리합니다.
- 승인된 기존 결제 계정에 Blaze 요금제가 연결되어 있습니다.

이 컴퓨터의 `functions/.env.kakao-hr-workshop-915`에 `WORKSHOP_RUNTIME_SERVICE_ACCOUNT`를 설정했습니다. 다른 환경에서 재배포할 때도 해당 변수를 같은 런타임 서비스 계정으로 설정하세요. 서비스 계정 개인 키는 생성하지 않았습니다.

이하 내용은 새 환경 구축 및 재설정 절차입니다.

## 1. 프로젝트 준비

GitHub 저장소 이름 예시: `kakao-hr-workshop`. 실제 저장소 이름과 공개 범위는 운영자가 결정합니다. 저장소 공개 범위와 별개로 Pages 주소는 공개될 수 있으므로 참가자 데이터는 Firebase 인증으로 보호합니다.

Firebase Console에서 프로젝트를 만들고 웹 앱을 등록합니다. Firestore는 Standard edition, 서울 `asia-northeast3`를 권장합니다. 초기 위치는 나중에 바꿀 수 없으므로 생성 단계에서 확인합니다. Authentication을 시작하고 웹 앱의 API 키를 사용할 수 있게 설정합니다. 이 앱은 Custom Token을 쓰므로 공개 회원가입 또는 익명 인증을 켤 필요가 없습니다.

실제 Functions 배포에는 Blaze 결제 연결이 필요합니다. 요금제 변경이나 결제 연결은 계정 소유자가 진행합니다. [공식 Functions 시작 안내](https://firebase.google.com/docs/functions/get-started)

Cloud Messaging → Web configuration에서 Web Push 인증서 키 쌍을 만들고 공개 VAPID 키를 준비합니다. [공식 FCM 웹 설정](https://firebase.google.com/docs/cloud-messaging/web/get-started)

## 2. 백엔드 배포

```sh
npm ci
npm ci --prefix functions
npx firebase login
npx firebase deploy --project YOUR_PROJECT_ID --only firestore,functions
```

`YOUR_PROJECT_ID`를 실제 ID로 바꿉니다. 원격 서버 인증 정보와 서비스 계정 키는 프런트엔드 `.env`에 넣지 않습니다.

Cloud Functions의 런타임 서비스 계정이 Firestore, Firebase Authentication, FCM 발송을 사용할 수 있어야 합니다. Custom Token 서명을 위해 IAM Service Account Credentials API를 켜고 런타임 서비스 계정에 자신의 계정에 대한 `iam.serviceAccounts.signBlob` 권한(Service Account Token Creator 역할)을 부여합니다. `redeemInvite`의 토큰 서명 오류가 발생하면 이 권한을 확인합니다. [Custom Token 생성과 서명 권한](https://firebase.google.com/docs/auth/admin/create-custom-tokens)

서버 리전은 `functions/src/index.ts`의 `asia-northeast3`입니다. 변경할 경우 `VITE_FIREBASE_REGION`도 동일하게 맞춥니다.

## 3. 최초 슈퍼 어드민 발급

이 단계는 CI가 아닌 신뢰하는 운영자 컴퓨터에서 수행합니다. Google Cloud SDK의 Application Default Credentials를 사용합니다.

```sh
gcloud auth application-default login
npm --prefix functions run build
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID WORKSHOP_URL=https://OWNER.github.io/REPOSITORY/ npm --prefix functions run bootstrap
```

운영자에게 Firestore 문서 생성 권한이 필요합니다. 화면에 **dave.h의 개인 입장 링크가 한 번 출력**됩니다. 최초 워크샵만 생성하며 기존 워크샵을 덮어쓰지 않습니다. 운영 데이터에는 데모 참가자·보물·일정이 들어가지 않습니다. 기본 행사 날짜는 예시이므로 관리자에서 실제 날짜와 장소를 설정해주세요.

dave.h가 개인 링크를 잃어버리면 아래 도구로 복구합니다. 기존 dave.h 링크와 세션은 폐기되며 데이터와 슈퍼 어드민 권한은 유지됩니다.

```sh
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID WORKSHOP_URL=https://OWNER.github.io/REPOSITORY/ npm --prefix functions run recover-superadmin
```

## 4. 프런트엔드 설정

로컬 실제 Firebase 연결은 `.env.example`을 `.env.local`로 복사하고 웹 앱 설정을 넣습니다. GitHub에서는 **Settings → Secrets and variables → Actions → Variables**에 아래 Repository variables를 등록합니다.

| 변수                                | Firebase 값         |
| ----------------------------------- | ------------------- |
| `VITE_FIREBASE_API_KEY`             | Web API key         |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Auth domain         |
| `VITE_FIREBASE_PROJECT_ID`          | Project ID          |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Storage bucket      |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FIREBASE_APP_ID`              | Web app ID          |
| `VITE_FIREBASE_VAPID_KEY`           | Web Push 공개 키    |

Firebase Web 설정은 브라우저가 사용하도록 공개되는 값입니다. 보안은 인증·보안 규칙·서버의 권한 검사로 보장합니다. 서비스 계정 JSON과 비공개 키는 위 변수에 넣지 마세요.

## 5. GitHub Pages 배포

저장소의 **Settings → Pages → Source → GitHub Actions**를 선택합니다. `main` 브랜치에 코드를 push하거나 `Deploy workshop to GitHub Pages` 워크플로를 실행합니다. 실제 원격 저장소가 아직 없다면 먼저 생성하고 연결해야 합니다.

워크플로는 Pages의 base path를 자동으로 사용합니다. URL fragment 라우팅을 쓰므로 `https://OWNER.github.io/REPOSITORY/#/timeline`과 개인 초대 링크의 새로고침도 404 없이 동작합니다. PWA manifest, 아이콘, 서비스 워커가 모두 `/REPOSITORY/` 경로를 따릅니다.

[GitHub Pages의 사용자 지정 워크플로 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 6. 현장 확인

- dave.h 링크로 들어가 실제 행사 날짜·장소·지도의 중심 위치 설정.
- 참가자 등록, 팀 구성, 개인 링크 전달. 추진위원회 멤버를 관리자 권한으로 변경.
- 일정 등록, 지도에 보물·꽝을 배치하고 힌트 확인.
- Android Chrome / iPhone Safari에서 홈 화면에 추가하고 알림 허용.
- 테스트 공지를 발송해 포그라운드 / 백그라운드 수신 확인.
- 두 휴대폰에서 같은 보물을 동시에 발견해 한 사람만 성공하는지 확인.
- 실제 장소에서 GPS 정확도와 반경이 적절한지 확인하고 게임 시작.

카메라와 GPS는 HTTPS 또는 localhost 환경이 필요합니다. iPhone의 웹 푸시는 홈 화면에 추가된 웹 앱에서 테스트합니다. 실제 기기에서의 권한 요청과 FCM 발송은 로컬 에뮬레이터로 확인할 수 없습니다. [FCM 메시지 수신 안내](https://firebase.google.com/docs/cloud-messaging/web/receive-messages)
