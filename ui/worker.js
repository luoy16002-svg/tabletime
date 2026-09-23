import loadHighs from "highs";
import wasmUrl from "highs/runtime?url";
import { Kitchen, emptyState } from "../core/kitchen.js";
const loaded = loadHighs({ locateFile: () => wasmUrl });
let kitchen;
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const highs = await loaded;
      if (!kitchen)
        kitchen = new Kitchen(
          highs,
          data.state?.schema === 1 ? data.state : emptyState(),
        );
      const result = kitchen.call(data.name, data.args);
      self.postMessage({ id: data.id, result, state: kitchen.state });
    } catch (e) {
      self.postMessage({ id: data.id, error: e.message });
    }
  });
};
