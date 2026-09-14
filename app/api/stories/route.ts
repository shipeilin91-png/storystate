import { productionService, respond } from "../../../lib/server/api";
export async function POST(request: Request) {
  return respond(async () => productionService().createStory(await request.json()));
}
