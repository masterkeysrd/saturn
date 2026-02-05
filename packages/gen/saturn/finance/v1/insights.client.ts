import { getAxios } from '@saturn/sdk/client';
import * as Types from './insights_pb';
import { create, fromJson, type MessageInitShape, toJson } from '@bufbuild/protobuf';

/**
 * GetInsights retrieves comprehensive financial insights, including spending
 * summaries, budget allocations, and spending trends over time.
 *
 * @param req Types.GetInsightsRequest
 * @returns Promise<Types.GetInsightsResponse>
 */
export async function getInsights(req: MessageInitShape<typeof Types.GetInsightsRequestSchema>): Promise<Types.GetInsightsResponse> {
  const msg = create(Types.GetInsightsRequestSchema, req);
  const body = toJson(Types.GetInsightsRequestSchema, msg);

  return getAxios().get(`/api/v1/finance/insights`
    , {
      params: {
        startDate:  body.startDate,
        endDate:  body.endDate,
        granularity:  body.granularity,
      }
    }
  ).then((resp) => {
    return fromJson(Types.GetInsightsResponseSchema, resp.data);
  });
}

