import { getAxios } from '@saturn/sdk/client';
import * as Types from './identity_pb';
import { create, fromJson, type MessageInitShape, toJson } from '@bufbuild/protobuf';

/**
 * CreateUser registers a new user identity with the system.
 *
 * This method is intended for explicit registration flows (e.g., "Sign Up"
 * with Email/Password). It ensures that the required profile information
 * (Name, Username) is provided upfront.
 *
 * Upon success, this method performs the following side effects:
 * 1. Creates the User resource in the Identity service.
 * 2. Links the provided credential (e.g., Password) to the user.
 * 3. Initializes the user's default context (e.g., Profile, Default Space).
 *
 * If the email or username is already taken, it returns an ALREADY_EXISTS error.
 *
 * @param req Types.CreateUserRequest
 * @returns Promise<Types.User>
 */
export async function createUser(req: MessageInitShape<typeof Types.CreateUserRequestSchema>): Promise<Types.User> {
  const msg = create(Types.CreateUserRequestSchema, req);
  const body = toJson(Types.CreateUserRequestSchema, msg);

  return getAxios().post(`/api/v1/identity/users`
    , body
  ).then((resp) => {
    return fromJson(Types.UserSchema, resp.data);
  });
}

/**
 * GetUser retrieves a user by ID.
 * Use "me" to get the currently authenticated user.
 *
 * @param req Types.GetUserRequest
 * @returns Promise<Types.User>
 */
export async function getUser(req: MessageInitShape<typeof Types.GetUserRequestSchema>): Promise<Types.User> {
  const msg = create(Types.GetUserRequestSchema, req);
  const body = toJson(Types.GetUserRequestSchema, msg);

  return getAxios().get(`/api/v1/identity/users/${body.id}`
  ).then((resp) => {
    return fromJson(Types.UserSchema, resp.data);
  });
}

/**
 * UpdateUser updates an existing user's information.
 * Use "me" to update the currently authenticated user.
 * Only the fields provided in the request will be updated.
 *
 * @param req Types.UpdateUserRequest
 * @returns Promise<Types.User>
 */
export async function updateUser(req: MessageInitShape<typeof Types.UpdateUserRequestSchema>): Promise<Types.User> {
  const msg = create(Types.UpdateUserRequestSchema, req);
  const body = toJson(Types.UpdateUserRequestSchema, msg);

  return getAxios().patch(`/api/v1/identity/users/${body.id}`
    , body
  ).then((resp) => {
    return fromJson(Types.UserSchema, resp.data);
  });
}

/**
 * LoginUser authenticates a user and establishes a new session.
 *
 * This method serves as the unified entry point for both traditional authentication
 * (Password) and federated login (Google, GitHub).
 *
 * Behavior depends on the authentication method provided:
 *
 * 1. Password:
 * Strictly validates credentials. Returns UNAUTHENTICATED if invalid.
 *
 * 2. Social (Google, GitHub, etc.):
 * Acts as a "Get or Create" operation.
 * - If the identity exists: Logs the user in.
 * - If the email exists but is not linked: Automatically links the account
 * (only if the social email is verified).
 * - If the user does not exist: Automatically registers a new User and
 * Identity ("Just-in-Time" provisioning).
 *
 * Returns a TokenPair containing a short-lived Access Token (JWT) and a
 * long-lived Refresh Token.
 *
 * @param req Types.LoginUserRequest
 * @returns Promise<Types.TokenPair>
 */
export async function loginUser(req: MessageInitShape<typeof Types.LoginUserRequestSchema>): Promise<Types.TokenPair> {
  const msg = create(Types.LoginUserRequestSchema, req);
  const body = toJson(Types.LoginUserRequestSchema, msg);

  return getAxios().post(`/api/v1/identity/users:login`
    , body
  ).then((resp) => {
    return fromJson(Types.TokenPairSchema, resp.data);
  });
}

/**
 * LogoutUser invalidates the current user's session.
 * This action revokes the current session token.
 *
 * @returns Promise<void>
 */
export async function logoutUser(): Promise<void> {
  return getAxios().post(`/api/v1/identity/users:logout`
    , body
  ).then(() => {
    return;
  });
}

/**
 * ListSessions lists all active sessions for the current user.
 *
 * @param req Types.ListSessionsRequest
 * @returns Promise<Types.ListSessionsResponse>
 */
export async function listSessions(req: MessageInitShape<typeof Types.ListSessionsRequestSchema>): Promise<Types.ListSessionsResponse> {
  const msg = create(Types.ListSessionsRequestSchema, req);
  const body = toJson(Types.ListSessionsRequestSchema, msg);

  return getAxios().get(`/api/v1/identity/sessions`
    , {
      params: {
        page:  body.page,
        pageSize:  body.pageSize,
      }
    }
  ).then((resp) => {
    return fromJson(Types.ListSessionsResponseSchema, resp.data);
  });
}

/**
 * RefreshSession refreshes a session using a refresh token.
 *
 * @param req Types.RefreshSessionRequest
 * @returns Promise<Types.TokenPair>
 */
export async function refreshSession(req: MessageInitShape<typeof Types.RefreshSessionRequestSchema>): Promise<Types.TokenPair> {
  const msg = create(Types.RefreshSessionRequestSchema, req);
  const body = toJson(Types.RefreshSessionRequestSchema, msg);

  return getAxios().post(`/api/v1/identity/sessions:refresh`
    , body
  ).then((resp) => {
    return fromJson(Types.TokenPairSchema, resp.data);
  });
}

/**
 * RevokeSession revokes a specific session by ID.
 *
 * @param req Types.RevokeSessionRequest
 * @returns Promise<void>
 */
export async function revokeSession(req: MessageInitShape<typeof Types.RevokeSessionRequestSchema>): Promise<void> {
  const msg = create(Types.RevokeSessionRequestSchema, req);
  const body = toJson(Types.RevokeSessionRequestSchema, msg);

  return getAxios().delete(`/api/v1/identity/sessions/${body.id}`
  ).then(() => {
    return;
  });
}

/**
 * RevokeAllSessions revokes all sessions for the current user.
 * This action logs the user out from all devices.
 *
 * @returns Promise<void>
 */
export async function revokeAllSessions(): Promise<void> {
  return getAxios().post(`/api/v1/identity/sessions:revokeAll`
    , body
  ).then(() => {
    return;
  });
}

