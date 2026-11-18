function isImageKitUrl(value, endpoint) {
  try {
    const url = new URL(value);
    const base = new URL(endpoint);
    const basePath = base.pathname.replace(/\/+$/, "");
    return url.origin === base.origin &&
      (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`));
  } catch {
    return false;
  }
}

export async function imagePayload(body) {
  const imageUrl = body.imageUrl;
  const imageFileId = body.imageFileId;
  if (!imageUrl && !imageFileId) return {};
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT?.replace(/\/+$/, "");
  if (!endpoint || !process.env.IMAGEKIT_PRIVATE_KEY) {
    const error = new Error("ImageKit is not configured on the server");
    error.status = 503;
    throw error;
  }
  if (!imageUrl || !imageFileId || !isImageKitUrl(imageUrl, endpoint)) {
    const error = new Error("Provide a valid ImageKit image URL and file ID");
    error.status = 400;
    throw error;
  }
  const auth = Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString("base64");
  const response = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(imageFileId)}/details`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  if (!response.ok) {
    const error = new Error("The uploaded image could not be verified with ImageKit");
    error.status = 400;
    throw error;
  }
  const file = await response.json();
  if (!file.fileId || file.fileId !== imageFileId || !file.url || !isImageKitUrl(file.url, endpoint)) {
    const error = new Error("The selected image file does not belong to this ImageKit account");
    error.status = 400;
    throw error;
  }
  return { imageUrl: file.url, imageFileId: file.fileId };
}

export async function deleteImage(fileId) {
  if (!fileId) return;
  if (!process.env.IMAGEKIT_PRIVATE_KEY) {
    const error = new Error("ImageKit deletion requires IMAGEKIT_PRIVATE_KEY");
    error.status = 503;
    throw error;
  }
  const auth = Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString("base64");
  const response = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${auth}` }
  });
  if (!response.ok && response.status !== 404) {
    const error = new Error("ImageKit could not delete the stored image");
    error.status = 502;
    throw error;
  }
}
