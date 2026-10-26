const MESSAGES: Record<string, string> = {
  error_pose: "We couldn't see your body clearly. Stand straight, facing the camera, with your shoulders in the photo.",
  error_invalid_src: "This photo only shows part of your body. Use one that shows you from the chest up or more.",
  error_multi_person: "There's more than one person in this photo. Use a photo of just you.",
  error_no_face: "We couldn't find a face. Use a clear photo with your face visible.",
  error_apply_region_mismatch: "This photo doesn't match the outfit. Try a photo from further back.",
  error_below_min_image_size: "This photo is too small. Use a sharper, larger photo.",
  exceed_max_filesize: "This photo is too large. Try a different one.",
  error_nsfw_content_detected: "This photo can't be used. Try a different one.",
  error_editing_failed: "The preview didn't change your outfit. Try a photo where your clothes are clearly visible.",
  timeout: "This is taking longer than usual. Check your connection and try again.",
  limit_device: "You've used all your previews for this event. Pick a size and confirm when you're ready.",
  limit_event: "Previews for this event are used up. You can still pick a size and confirm.",
};

export function tryonErrorMessage(code: string | null | undefined) {
  return (code && MESSAGES[code]) ?? "The preview didn't work this time. Try again, or use a different photo.";
}
