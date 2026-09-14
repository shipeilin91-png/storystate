import { productionService, respond, storyRequest } from "../../../../../lib/server/api";
type Context = {params: Promise<{storyId:string;path:string[]}>};
export async function GET(_request: Request, context: Context) {
  return respond(async () => {const {storyId,path} = await context.params; return storyRequest(productionService(),"GET",storyId,path);});
}
export async function POST(request: Request, context: Context) {
  return respond(async () => {const {storyId,path} = await context.params; return storyRequest(productionService(),"POST",storyId,path,request);});
}
