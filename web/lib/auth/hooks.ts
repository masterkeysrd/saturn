import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";
import config from "../config/config";
import { useEffect, useState } from "react";

const userPool = new CognitoUserPool({
  UserPoolId: config.cognito.userPoolId,
  ClientId: config.cognito.clientId,
});

export interface SignInProps {
  onSuccess: (session: CognitoUserSession) => void;
  onFailure: (error: Error) => void;
}

export function useSignIn({ onSuccess, onFailure }: SignInProps) {
  const signIn = (email: string, password: string): void => {
    const authenticationDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess,
      onFailure,
    });
  };

  return { signIn };
}

export interface SignUpProps {
  onSuccess: (state: SignUpState) => void;
  onFailure: (error: Error) => void;
}

export interface SignUpState {
  success: boolean;
  message: string;
  username: string;
}

interface SignUpData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export function useSignUp({ onSuccess, onFailure }: SignUpProps) {
  const signUp = (data: SignUpData): void => {
    userPool.signUp(
      data.email,
      data.password,
      [
        new CognitoUserAttribute({
          Name: "given_name",
          Value: data.firstName,
        }),
        new CognitoUserAttribute({
          Name: "family_name",
          Value: data.lastName,
        }),
      ],
      [],
      (error, result) => {
        if (error) {
          onFailure(error);
          return;
        }

        if (!result) {
          onFailure(new Error("No result returned"));
          return;
        }

        const delivery = result?.codeDeliveryDetails;
        const message = `Sign up successful. An ${delivery?.DeliveryMedium} has been sent to ${delivery?.Destination}`;
        onSuccess({
          success: true,
          message,
          username: result?.user.getUsername() || "",
        });
      },
    );
  };

  return { signUp };
}

export interface ConfirmSignUpProps {
  onSuccess: (state: ConfirmSignUpState) => void;
  onFailure: (error: ConfirmSignUpState) => void;
}

export interface ConfirmSignUpState {
  success: boolean;
  message: string;
}

export function useConfirmSignUp({ onSuccess, onFailure }: ConfirmSignUpProps) {
  const confirmSignUp = (email: string, code: string): void => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });
    cognitoUser.confirmRegistration(code, true, (error) => {
      if (error) {
        onFailure({ success: false, message: error.message });
      } else {
        onSuccess({ success: true, message: "Sign up confirmed" });
      }
    });
  };

  return { confirmSignUp };
}

export function useSession() {
  const [session, setSession] = useState<CognitoUserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = userPool.getCurrentUser();

    if (!user) {
      setLoading(false);
      return;
    }

    user.getSession((error: Error, session: null) => {
      if (error) {
        setLoading(false);
        return;
      }

      setSession(session);
      setLoading(false);
    });
  }, []);

  return { session, loading };
}
