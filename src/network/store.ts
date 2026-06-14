import { configureStore } from "@reduxjs/toolkit";

import { lifeHarnessApi } from "./lifeHarnessApi";

export function createLifeHarnessNetworkStore() {
  return configureStore({
    reducer: {
      [lifeHarnessApi.reducerPath]: lifeHarnessApi.reducer
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(lifeHarnessApi.middleware)
  });
}

export const lifeHarnessNetworkStore = createLifeHarnessNetworkStore();

export type LifeHarnessNetworkStore = ReturnType<typeof createLifeHarnessNetworkStore>;
export type LifeHarnessNetworkState = ReturnType<LifeHarnessNetworkStore["getState"]>;
export type LifeHarnessNetworkDispatch = LifeHarnessNetworkStore["dispatch"];
