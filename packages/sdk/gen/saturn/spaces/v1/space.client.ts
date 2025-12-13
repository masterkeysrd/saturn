import { getAxios } from '@/client';
import * as Types from './space_pb';
import { create, fromJson, toJson } from '@bufbuild/protobuf';

/**
 * Creates a new space.
 * The space owner is set to the authenticated user making the request.
 *
 * @param req Types.CreateSpaceRequest
 * @returns Promise<Types.Space>
 */
export async function createSpace(req: Types.CreateSpaceRequest): Promise<Types.Space> {
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
export async function listSpaces(req: Types.ListSpacesRequest): Promise<Types.ListSpacesResponse> {
  const msg = create(Types.ListSpacesRequestSchema, req);
  const body = toJson(Types.ListSpacesRequestSchema, msg);

  return getAxios().get(`/api/v1/space/spaces`
    , {
      params: {
        search:  body.search,
        ownerId:  body.ownerId,
        view:  body.view,
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
export async function getSpace(req: Types.GetSpaceRequest): Promise<Types.Space> {
  const msg = create(Types.GetSpaceRequestSchema, req);
  const body = toJson(Types.GetSpaceRequestSchema, msg);

  return getAxios().get(`/api/v1/space/spaces/"${body.id}"`
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
 * @param req Types.UpdateSpaceRequest
 * @returns Promise<Types.Space>
 */
export async function updateSpace(req: Types.UpdateSpaceRequest): Promise<Types.Space> {
  const msg = create(Types.UpdateSpaceRequestSchema, req);
  const body = toJson(Types.UpdateSpaceRequestSchema, msg);

  return getAxios().patch(`/api/v1/space/spaces/"${body.id}"`
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
 * Deletes a space.
 *
 * @param req Types.DeleteSpaceRequest
 * @returns Promise<void>
 */
export async function deleteSpace(req: Types.DeleteSpaceRequest): Promise<void> {
  const msg = create(Types.DeleteSpaceRequestSchema, req);
  const body = toJson(Types.DeleteSpaceRequestSchema, msg);

  return getAxios().delete(`/api/v1/space/spaces/"${body.id}"`
  ).then(() => {
    return;
  });
}

