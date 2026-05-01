/// <reference path="../css.d.ts" />
import "@/global.css";
import { Stack } from "expo-router";
import { AuthProvider } from "../context/AuthContext";
import AuthRouter from "../components/AuthRouter";

export default function RootLayout() {
    return (
        <AuthProvider>
            <AuthRouter>
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
            </AuthRouter>
        </AuthProvider>
    )
}
