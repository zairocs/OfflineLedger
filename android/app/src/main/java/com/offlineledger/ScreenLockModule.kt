package com.offlineledger

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScreenLockModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private var wasScreenOff = false

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == Intent.ACTION_SCREEN_OFF) {
        wasScreenOff = true
      }
    }
  }

  init {
    try {
      val filter = IntentFilter(Intent.ACTION_SCREEN_OFF)
      reactContext.registerReceiver(screenReceiver, filter)
    } catch (e: Exception) {
      // Ignored if receiver fails
    }
  }

  override fun getName(): String = "ScreenLockModule"

  @ReactMethod
  fun restartApp(promise: Promise) {
    try {
      val context = reactApplicationContext
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (intent == null) {
        promise.reject("RESTART_FAILED", "Could not create launch intent")
        return
      }
      intent.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
      )
      promise.resolve(true)
      Handler(Looper.getMainLooper()).post {
        val activity = context.currentActivity
        if (activity != null) {
          activity.startActivity(intent)
          activity.finishAffinity()
        } else {
          context.startActivity(intent)
        }
        Runtime.getRuntime().exit(0)
      }
    } catch (e: Exception) {
      promise.reject("RESTART_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun isPhoneLocked(promise: Promise) {
    try {
      val km = reactApplicationContext.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
      val isKeyguardLocked = km?.isKeyguardLocked ?: false
      val locked = isKeyguardLocked || wasScreenOff
      wasScreenOff = false // Reset screen off flag after check
      promise.resolve(locked)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  override fun onCatalystInstanceDestroy() {
    super.onCatalystInstanceDestroy()
    try {
      reactApplicationContext.unregisterReceiver(screenReceiver)
    } catch (e: Exception) {
      // Ignored if already unregistered
    }
  }
}
