import { getAxios } from '@saturn/sdk/client';
import * as Types from './tenancy_pb';
import { create, fromJson, type MessageInitShape, toJson } from '@bufbuild/protobuf';

/**
 * @param req Types.CreateSpaceRequest
 * @returns Promise<Types.Space>
 */
export async function createSpace(req: MessageInitShape<typeof Types.CreateSpaceRequestSchema>): Promise<Types.Space> {
  const msg = create(Types.CreateSpaceRequestSchema, req);
  const body = toJson(Types.CreateSpaceRequestSchema, msg);

  return getAxios().post(`/api/v1/spaces`
    , body.space
  ).then((resp) => {
    return fromJson(Types.SpaceSchema, resp.data);
  });
}

/**
 * Lists spaces accessible to the authenticated user.
 *
 * @param req Types.ListSpacesRequest
 * @returns Promise<Types.ListSpacesResponse>
 */
export async function listSpaces(req: MessageInitShape<typeof Types.ListSpacesRequestSchema>): Promise<Types.ListSpacesResponse> {
  const msg = create(Types.ListSpacesRequestSchema, req);
  const body = toJson(Types.ListSpacesRequestSchema, msg);

  return getAxios().get(`/api/v1/spaces`
    , {
      params: {
        search:  body.search,
        ownerId:  body.ownerId,
        view:  body.view,
        orderBy:  body.orderBy,
        page:  body.page,
        pageSize:  body.pageSize,
      }
    }
  ).then((resp) => {
    return fromJson(Types.ListSpacesResponseSchema, resp.data);
  });
}

/**
 * Get information from a specified Space.
 *
 * @param req Types.GetSpaceRequest
 * @returns Promise<Types.Space>
 */
export async function getSpace(req: MessageInitShape<typeof Types.GetSpaceRequestSchema>): Promise<Types.Space> {
  const msg = create(Types.GetSpaceRequestSchema, req);
  const body = toJson(Types.GetSpaceRequestSchema, msg);

  return getAxios().get(`/api/v1/spaces/${body.id}`
    , {
      params: {
        view:  body.view,
      }
    }
  ).then((resp) => {
    return fromJson(Types.SpaceSchema, resp.data);
  });
}

/**
 * Updates a space's information.
 *
 * Only users with the OWNER can update space information.
 *
 * @param req Types.UpdateSpaceRequest
 * @returns Promise<Types.Space>
 */
export async function updateSpace(req: MessageInitShape<typeof Types.UpdateSpaceRequestSchema>): Promise<Types.Space> {
  const msg = create(Types.UpdateSpaceRequestSchema, req);
  const body = toJson(Types.UpdateSpaceRequestSchema, msg);

  return getAxios().patch(`/api/v1/spaces/${body.id}`
    , body.space
    , {
      params: {
        updateMask:  body.updateMask,
      }
    }
  ).then((resp) => {
    return fromJson(Types.SpaceSchema, resp.data);
  });
}

/**
 * Deletes a space (soft delete).
 *
 * The space will be marked as deleted but can be restored within 30 days.
 * Only OWNER can delete spaces.
 *
 * @param req Types.DeleteSpaceRequest
 * @returns Promise<void>
 */
export async function deleteSpace(req: MessageInitShape<typeof Types.DeleteSpaceRequestSchema>): Promise<void> {
  const msg = create(Types.DeleteSpaceRequestSchema, req);
  const body = toJson(Types.DeleteSpaceRequestSchema, msg);

  return getAxios().delete(`/api/v1/spaces/${body.id}`
  ).then(() => {
    return;
  });
}

/**
 * Adds a new member to the space.
 * Only users with the OWNER or ADMIN role can add members.
 *
 * @param req Types.AddMemberRequest
 * @returns Promise<Types.Member>
 */
export async function addMember(req: MessageInitShape<typeof Types.AddMemberRequestSchema>): Promise<Types.Member> {
  const msg = create(Types.AddMemberRequestSchema, req);
  const body = toJson(Types.AddMemberRequestSchema, msg);

  return getAxios().post(`/api/v1/spaces/${body.spaceId}/members`
    , body
  ).then((resp) => {
    return fromJson(Types.MemberSchema, resp.data);
  });
}

/**
 * Lists all members in the space.
 * Only users with access to the space can list its members.
 *
 * @param req Types.ListMembersRequest
 * @returns Promise<Types.ListMembersResponse>
 */
export async function listMembers(req: MessageInitShape<typeof Types.ListMembersRequestSchema>): Promise<Types.ListMembersResponse> {
  const msg = create(Types.ListMembersRequestSchema, req);
  const body = toJson(Types.ListMembersRequestSchema, msg);

  return getAxios().get(`/api/v1/spaces/${body.spaceId}/members`
    , {
      params: {
        orderBy:  body.orderBy,
        page:  body.page,
        pageSize:  body.pageSize,
      }
    }
  ).then((resp) => {
    return fromJson(Types.ListMembersResponseSchema, resp.data);
  });
}

/**
 * Updates a member's role in the space.
 * Only users with the OWNER or ADMIN role can update members.
 *
 * @param req Types.UpdateMemberRequest
 * @returns Promise<Types.Member>
 */
export async function updateMember(req: MessageInitShape<typeof Types.UpdateMemberRequestSchema>): Promise<Types.Member> {
  const msg = create(Types.UpdateMemberRequestSchema, req);
  const body = toJson(Types.UpdateMemberRequestSchema, msg);

  return getAxios().patch(`/api/v1/spaces/${body.spaceId}/members/${body.userId}`
    , body.member
    , {
      params: {
        updateMask:  body.updateMask,
      }
    }
  ).then((resp) => {
    return fromJson(Types.MemberSchema, resp.data);
  });
}

/**
 * Removes a member from the space.
 *
 * Permissions:
 * - OWNER:  Can remove any member (except themselves and other owners)
 * - ADMIN: Can remove MEMBER role only (not ADMIN or OWNER)
 * - MEMBER: Cannot remove members
 *
 * @param req Types.RemoveMemberRequest
 * @returns Promise<void>
 */
export async function removeMember(req: MessageInitShape<typeof Types.RemoveMemberRequestSchema>): Promise<void> {
  const msg = create(Types.RemoveMemberRequestSchema, req);
  const body = toJson(Types.RemoveMemberRequestSchema, msg);

  return getAxios().delete(`/api/v1/spaces/${body.spaceId}/members/${body.userId}`
  ).then(() => {
    return;
  });
}

