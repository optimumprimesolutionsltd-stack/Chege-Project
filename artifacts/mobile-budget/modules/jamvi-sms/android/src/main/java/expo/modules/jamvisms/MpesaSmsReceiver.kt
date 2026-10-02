package expo.modules.jamvisms

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Telephony

/**
 * "Tell me when an M-Pesa message arrives": a notification the moment M-Pesa
 * texts, even with Jamvi closed. Tapping it opens the new messages in the
 * import, to review; nothing is saved or sent from here.
 *
 * Off until the person turns it on in Jamvi (JamviSmsModule.setNotify). Only
 * M-Pesa's own sender. Needs RECEIVE_SMS, which a Play Store build leaves out.
 */
class MpesaSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    if (!JamviSmsPrefs.notifyOn(context)) return
    val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    if (parts.isEmpty()) return
    val sender = (parts[0].originatingAddress ?: "").uppercase().replace(Regex("[^A-Z0-9]"), "")
    if (sender !in JamviSmsPrefs.senders(context)) return
    val body = parts.joinToString("") { it.messageBody ?: "" }.trim()
    if (body.isEmpty()) return
    notify(context, body)
  }

  private fun notify(context: Context, body: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "M-Pesa messages", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "When M-Pesa texts you, so you can record it in Jamvi."
      })
    }
    val open = Intent(Intent.ACTION_VIEW, Uri.parse("mobile-budget://mpesa-import?fromSms=new")).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) android.app.Notification.Builder(context, CHANNEL)
      else @Suppress("DEPRECATION") android.app.Notification.Builder(context)
    val notification = builder
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("New M-Pesa message - tap to record it")
      .setContentText(body.take(120))
      .setStyle(android.app.Notification.BigTextStyle().bigText(body.take(400)))
      .setContentIntent(tap)
      .setAutoCancel(true)
      .build()
    // One notification per message: a busy day shows each, newest on top.
    manager.notify(NOTIFY_BASE + (System.currentTimeMillis() % 100_000).toInt(), notification)
  }

  companion object {
    const val CHANNEL = "mpesa-messages"
    const val NOTIFY_BASE = 4_200_000
  }
}

/** The switch the receiver reads; set from Jamvi, kept in the app's own preferences. */
object JamviSmsPrefs {
  private const val FILE = "jamvi-sms"
  private const val NOTIFY = "notify"
  private const val SENDERS = "senders"

  fun notifyOn(context: Context): Boolean = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean(NOTIFY, false)

  fun senders(context: Context): Set<String> =
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getStringSet(SENDERS, null) ?: setOf("MPESA")

  fun set(context: Context, on: Boolean, senders: List<String>) {
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
      .putBoolean(NOTIFY, on)
      .putStringSet(SENDERS, senders.map { it.uppercase() }.toSet())
      .apply()
  }
}
