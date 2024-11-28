export interface Config {
  cognito: {
    userPoolId: string;
    clientId: string;
  };
}

function loadConfig(): Config {
  return {
    cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
    },
  };
}

export const config = loadConfig();

export default config;
