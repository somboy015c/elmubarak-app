package com.elmubarak.digitalhub;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Shows Android's own fingerprint/face prompt for the app's quick login. */
@CapacitorPlugin(name = "AppBiometric")
public class AppBiometricPlugin extends Plugin {
    private static final int STRONG = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int status = BiometricManager.from(getContext()).canAuthenticate(STRONG);
        JSObject result = new JSObject();
        result.put("available", status == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(result);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(call.getString("title", "Unlock Elmubarak"))
            .setSubtitle(call.getString("subtitle", "Use your fingerprint to continue"))
            .setNegativeButtonText("Use PIN")
            .setAllowedAuthenticators(STRONG)
            .build();

        getActivity().runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(
                getActivity(),
                ContextCompat.getMainExecutor(getContext()),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        JSObject ok = new JSObject();
                        ok.put("success", true);
                        call.resolve(ok);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence message) {
                        JSObject failed = new JSObject();
                        failed.put("success", false);
                        failed.put("message", message.toString());
                        call.resolve(failed);
                    }
                }
            );
            prompt.authenticate(info);
        });
    }
}
