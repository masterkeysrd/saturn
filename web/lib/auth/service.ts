import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";
import config, { Config } from "../config/config";

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
}

export interface SignUpUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface SignUpState {
  username: string;
  success: boolean;
  medium: string;
  destination: string;
  message: string;
}

export interface ConfirmSignUp {
  username: string;
  code: string;
}

export interface ConfirmSignUpState {
  success: boolean;
  message: string;
}

export class AuthService {
  private readonly userPool: CognitoUserPool;

  constructor(config: Config) {
    this.userPool = new CognitoUserPool({
      UserPoolId: config.cognito.userPoolId,
      ClientId: config.cognito.clientId,
    });
  }

  session(): Promise<[CognitoUserSession | null, UserProfile | null]> {
    return new Promise((resolve) => {
      const user = this.userPool.getCurrentUser();

      if (!user) {
        resolve([null, null]);
        return;
      }

      user.getSession((error: Error, session: CognitoUserSession | null) => {
        if (error) {
          resolve([null, null]);
          return;
        }

        if (!session) {
          resolve([null, null]);
          return;
        }

        user.getUserAttributes((error, attributes) => {
          if (error) {
            resolve([session, null]);
            return;
          }

          const profile: UserProfile = {
            firstName: "",
            lastName: "",
            email: "",
          };

          if (!attributes) {
            resolve([session, profile]);
            return;
          }

          attributes.forEach((attribute) => {
            switch (attribute.getName()) {
              case "given_name":
                profile.firstName = attribute.getValue();
                break;
              case "family_name":
                profile.lastName = attribute.getValue();
                break;
              case "email":
                profile.email = attribute.getValue();
                break;
            }
          });

          resolve([session, profile]);
        });
      });
    });
  }

  signIn(email: string, password: string): Promise<CognitoUserSession> {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username: email,
        Pool: this.userPool,
      });

      const authenticationDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      user.authenticateUser(authenticationDetails, {
        onSuccess: (session: CognitoUserSession) => {
          resolve(session);
        },
        onFailure: (error: Error) => {
          reject(error);
        },
      });
    });
  }

  signOut(): Promise<void> {
    return new Promise((resolve, reject) => {
      const user = this.userPool.getCurrentUser();

      if (!user) {
        reject(new Error("No user found"));
        return;
      }

      user.signOut();
      resolve();
    });
  }

  signUp(user: SignUpUser): Promise<SignUpState> {
    return new Promise((resolve) => {
      this.userPool.signUp(
        user.email,
        user.password,
        [
          new CognitoUserAttribute({
            Name: "email",
            Value: user.email,
          }),
          new CognitoUserAttribute({
            Name: "given_name",
            Value: user.firstName,
          }),
          new CognitoUserAttribute({
            Name: "family_name",
            Value: user.lastName,
          }),
        ],
        [],
        (error, result) => {
          if (error) {
            resolve({
              success: false,
              username: user.email,
              medium: "",
              destination: "",
              message: error.message,
            });
            return;
          }

          if (!result) {
            resolve({
              success: false,
              username: user.email,
              medium: "",
              destination: "",
              message: "No result returned",
            });
            return;
          }

          const delivery = result.codeDeliveryDetails;
          const message = `Hello ${user.firstName}, sign up successful. An ${delivery?.DeliveryMedium} has been sent to ${delivery?.Destination}`;
          resolve({
            success: true,
            username: user.email,
            medium: delivery?.DeliveryMedium || "",
            destination: delivery?.Destination || "",
            message,
          });
        },
      );
    });
  }

  confirmSignUp({
    username,
    code,
  }: ConfirmSignUp): Promise<ConfirmSignUpState> {
    return new Promise((resolve) => {
      const user = new CognitoUser({
        Username: username,
        Pool: this.userPool,
      });

      user.confirmRegistration(code, true, (error, result) => {
        if (error) {
          resolve({
            success: false,
            message: error.message,
          });
          return;
        }

        if (!result) {
          resolve({
            success: false,
            message: "No result returned",
          });
          return;
        }

        resolve(result);
      });
    });
  }
}

export default new AuthService(config);
