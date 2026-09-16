import { productionService, respond, storyRequest } from "../../../../../lib/server/api";
import { extractionRequest } from "../../../../../lib/server/extraction-api";
type Context = {params: Promise<{storyId:string;path:string[]}>};
export const runtime = "nodejs";
// Extraction has a 20s provider timeout; 60s bounds the complete request on supported hosts.
export const maxDuration = 60;
export async function GET(_request: Request, context: Context) {
  return respond(async () => {
    const {storyId,path} = await context.params;
    if (path.join("/") === "review") return productionService().getReviewHydration(storyId);
    return storyRequest(productionService(),"GET",storyId,path);
  });
}
export async function POST(request: Request, context: Context) {
  return respond(async () => {
    const {storyId,path} = await context.params;
    if (path.join("/") === "extract") return extractionRequest(request, storyId);
    return storyRequest(productionService(),"POST",storyId,path,request);
  });
}
