## Start Clean
npm run clean
npm install
npm run build

## IF ANY ISSUES APPEARS
## Start with Shared
npm run build -w shared

## RUN - IF tsup ISSUES APPEAR
npm install -D tsup -w shared

## OR - For every services at the root-level -> **BETTER APPROACH**
npm install -D tsup

## Then
npm run build -w shared
npm run build -w services/achievements -c
npm run build -w services/auth -c
npm run build -w services/performance -c
npm run build -w services/profile -c
npm run build -w services/progress -c
npm run build -w services/settings -c
npm run build -w services/streaks -c


## services/<SERVICE>/package.json >> scripts->build "tsc -b && cpx src/db/migrations/**/* dist/db/migrations" | To create the migrations folder in dist/db directory

## nlp-service and speech-service are Python services built and managed exclusively via skaffold / Docker, not via npm

# Ingress Nginx -> Kubernetes
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.14.2/deploy/static/provider/cloud/deploy.yaml

