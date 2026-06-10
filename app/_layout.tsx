import { Stack } from "expo-router";

import { AppShellLayout } from "../src/components/AppShellLayout";
import { colors } from "../src/components/styles";
import { LifeHarnessProvider } from "../src/state/LifeHarnessState";

export default function RootLayout() {
  return (
    <LifeHarnessProvider>
      <AppShellLayout>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bgSecondary },
            headerTintColor: colors.textPrimary,
            contentStyle: { backgroundColor: colors.bgPrimary, flex: 1 }
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="board" options={{ headerShown: false }} />
          <Stack.Screen name="career" options={{ headerShown: false }} />
          <Stack.Screen name="progress" options={{ headerShown: false }} />
          <Stack.Screen name="review" options={{ headerShown: false }} />
          <Stack.Screen name="log" options={{ headerShown: false }} />
          <Stack.Screen name="career-intake" options={{ headerShown: false }} />
          <Stack.Screen name="candidate-intake" options={{ headerShown: false }} />
          <Stack.Screen name="job-candidates" options={{ headerShown: false }} />
          <Stack.Screen name="resume-bank" options={{ headerShown: false }} />
          <Stack.Screen name="memory-bank" options={{ headerShown: false }} />
          <Stack.Screen name="job-sources" options={{ headerShown: false }} />
          <Stack.Screen name="source-setup" options={{ headerShown: false }} />
          <Stack.Screen name="career-pack" options={{ headerShown: false }} />
          <Stack.Screen name="ask-harness" options={{ headerShown: false }} />
          <Stack.Screen name="raw-lab" options={{ headerShown: false }} />
          <Stack.Screen name="card/[id]" options={{ title: "Card Detail" }} />
        </Stack>
      </AppShellLayout>
    </LifeHarnessProvider>
  );
}
