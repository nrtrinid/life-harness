import { Stack } from "expo-router";

import { colors } from "../src/components/styles";
import { LifeHarnessProvider } from "../src/state/LifeHarnessState";

export default function RootLayout() {
  return (
    <LifeHarnessProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bgSecondary },
          headerTintColor: colors.textPrimary,
          contentStyle: { backgroundColor: colors.bgPrimary }
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="board" options={{ headerShown: false }} />
        <Stack.Screen name="progress" options={{ headerShown: false }} />
        <Stack.Screen name="log" options={{ headerShown: false }} />
        <Stack.Screen name="career-intake" options={{ headerShown: false }} />
        <Stack.Screen name="candidate-intake" options={{ headerShown: false }} />
        <Stack.Screen name="job-candidates" options={{ headerShown: false }} />
        <Stack.Screen name="resume-bank" options={{ headerShown: false }} />
        <Stack.Screen name="job-sources" options={{ headerShown: false }} />
        <Stack.Screen name="source-setup" options={{ headerShown: false }} />
        <Stack.Screen name="ask-harness" options={{ headerShown: false }} />
        <Stack.Screen name="card/[id]" options={{ title: "Card Detail" }} />
      </Stack>
    </LifeHarnessProvider>
  );
}
