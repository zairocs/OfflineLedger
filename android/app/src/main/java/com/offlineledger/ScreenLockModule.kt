package com.offlineledger

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
