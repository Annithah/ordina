package expo.modules.ordinaalarms

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Whether reminders can fire on time (exact alarms, battery optimisation), and shortcuts to the
 * phone settings that fix it. Used by Settings > Notifications > "Reminders not arriving?".
 */
class OrdinaAlarmsModule : Module() {
  private val context: Context?
    get() = appContext.reactContext

  private fun open(intent: Intent): Boolean {
    val ctx = context ?: return false
    return try {
      ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (error: Exception) {
      false
    }
  }

  override fun definition() = ModuleDefinition {
    Name("OrdinaAlarms")

    Function("canScheduleExactAlarms") {
      val ctx = context
      if (ctx == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        true
      } else {
        val alarms = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarms.canScheduleExactAlarms()
      }
    }

    Function("isIgnoringBatteryOptimizations") {
      val ctx = context
      if (ctx == null) {
        true
      } else {
        val power = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        power.isIgnoringBatteryOptimizations(ctx.packageName)
      }
    }

    Function("openExactAlarmSettings") {
      val ctx = context
      if (ctx == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        false
      } else {
        open(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + ctx.packageName)))
      }
    }

    Function("openBatterySettings") {
      open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }
  }
}
