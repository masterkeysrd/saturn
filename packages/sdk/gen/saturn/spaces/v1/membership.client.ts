import { getAxios } from '@/client';
import * as Types from './membership_pb';
import { create, fromJson, toJson } from '@bufbuild/protobuf';

/**
 * Lists all members in the space.
 *
 * @param req Types.ListMembersRequest
 * @returns Promise<Types.ListMembersResponse>
 */
export async function listMembers(req: Types.ListMembersRequest): Promise<Types.ListMembersResponse> {
  const msg = create(Types.ListMembersRequestSchema, req);
  const body = toJson(Types.ListMembersRequestSchema, msg);

  return getAxios().get(`/api/v1/space/members`
    , {
      params: {
        page:  body.page,
        pageSize:  body.pageSize,
      }
    }
  ).then((resp) => {
    return fromJson(Types.ListMembersResponseSchema, resp.data);
  });
}

/**
 * Adds a new member to the space.
 * Only users with the OWNER or ADMIN role can add members.
 *
 * @param req Types.AddMemberRequest
 * @returns Promise<Types.Member>
 */
export async function addMember(req: Types.AddMemberRequest): Promise<Types.Member> {
  const msg = create(Types.AddMemberRequestSchema, req);
  const body = toJson(Types.AddMemberRequestSchema, msg);

  return getAxios().post(`/api/v1/space/members`
    , body
  ).then((resp) => {
    return fromJson(Types.MemberSchema, resp.data);
  });
}

/**
 * Updates a member's role or information in the space.
 * Only users with the OWNER or ADMIN role can update members. Only
 * OWNERs can change another role to ADMIN.
 *
 * @param req Types.UpdateMemberRequest
 * @returns Promise<Types.Member>
 */
export async function updateMember(req: Types.UpdateMemberRequest): Promise<Types.Member> {
  const msg = create(Types.UpdateMemberRequestSchema, req);
  const body = toJson(Types.UpdateMemberRequestSchema, msg);

  return getAxios().patch(`/api/v1/space/members/"${body.userId}"`
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
 * Only users with the OWNER or ADMIN role can remove members. Only OWNERs
 * can remove a member with the ADMIN role.
 *
 * @param req Types.RemoveMemberRequest
 * @returns Promise<void>
 */
export async function removeMember(req: Types.RemoveMemberRequest): Promise<void> {
  const msg = create(Types.RemoveMemberRequestSchema, req);
  const body = toJson(Types.RemoveMemberRequestSchema, msg);

  return getAxios().delete(`/api/v1/space/members/"${body.userId}"`
  ).then(() => {
    return;
  });
}

