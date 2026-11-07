import { makeThumb, type ThumbJob, type ThumbReply } from "./thumbCore";

type Scope = {
  addEventListener(type: "message", listener: (event: MessageEvent<ThumbJob>) => void): void;
  postMessage(message: ThumbReply): void;
};

const scope = self as unknown as Scope;

scope.addEventListener("message", (event) => {
  const { id, url, width, height } = event.data;
  makeThumb(url, width, height)
    .then((blob) => scope.postMessage({ id, blob }))
    .catch((error: unknown) => scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }));
});
