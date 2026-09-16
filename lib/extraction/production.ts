import { DomainError } from "../domain/errors";
import { ChatCompletionsExtractorProvider, type ExtractorProvider } from "./provider";

// This is intentionally separate from the historical evaluation provider settings.
export function productionExtractor(): ExtractorProvider {
  const { STORYSTATE_EXTRACTOR_MODEL, STORYSTATE_EXTRACTOR_ENDPOINT, STORYSTATE_EXTRACTOR_API_KEY } = process.env;
  if (!STORYSTATE_EXTRACTOR_MODEL || !STORYSTATE_EXTRACTOR_ENDPOINT || !STORYSTATE_EXTRACTOR_API_KEY)
    throw new DomainError("EXTRACTOR_NOT_CONFIGURED", "Extraction service is not configured", 503);
  try {
    return new ChatCompletionsExtractorProvider(STORYSTATE_EXTRACTOR_MODEL, STORYSTATE_EXTRACTOR_ENDPOINT, STORYSTATE_EXTRACTOR_API_KEY);
  } catch {
    throw new DomainError("EXTRACTOR_NOT_CONFIGURED", "Extraction service is not configured", 503);
  }
}
