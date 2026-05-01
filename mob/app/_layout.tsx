/// <reference path="../css.d.ts" />
import "@/global.css";
import { Stack } from "expo-router";
import { AuthProvider } from "../context/AuthContext";

export default function RootLayout() {
    return (
        <AuthProvider>
            <Stack>
                <Stack.Screen
                    name='Login'
                    options={{ headerShown: false }}
                />
                <Stack.Screen
                    name='Staff'
                    options={{ headerShown: false }}
                />
            </Stack>
        </AuthProvider>
    )
}
