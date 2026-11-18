import axios from "axios";
import api from "./api";

const maxBytes = 5 * 1024 * 1024;
const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

export async function uploadImage(file) {
  if (!file || !allowedTypes.includes(file.type) || file.size > maxBytes || file.size === 0) {
    throw new Error("Choose a JPG, PNG, or WebP image smaller than 5 MB.");
  }
  const { data: auth } = await api.get("/upload/auth");
  const form = new FormData();
  form.append("file", file);
  form.append("fileName", file.name);
  form.append("publicKey", auth.publicKey);
  form.append("token", auth.token);
  form.append("expire", auth.expire);
  form.append("signature", auth.signature);
  form.append("folder", "/stockwise");
  const { data } = await axios.post("https://upload.imagekit.io/api/v1/files/upload", form);
  if (!data.url || !data.fileId) throw new Error("ImageKit did not return a valid image.");
  return { imageUrl: data.url, imageFileId: data.fileId };
}
