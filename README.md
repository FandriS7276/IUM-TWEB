# packages to be installed

# node.js long term support installation and default setting
nvm install --lts
nvm use --lts
nvm alias default lts/*

# using environment and rate limit variables and settings to prevent abuse
npm install dotenv
npm install express-rate-limit


# using lint to improve code and avoid bugs
npm install eslint --save-dev
npx eslint --init

