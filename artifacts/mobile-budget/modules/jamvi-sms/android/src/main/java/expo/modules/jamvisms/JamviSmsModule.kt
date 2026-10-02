package expo.modules.jamvisms

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads M-Pesa's own text messages, for the M-Pesa import.
 *
 * Only messages from the senders asked for (M-Pesa's), only between two
 * dates, only when the person asks. The text goes to the same reader as
 * pasted messages; nothing here sends anything anywhere.
 */
class JamviSmsModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "Android is not ready yet.", null)

  override fun definition() = ModuleDefinition {
    Name("JamviSms")

    // Whether this build asks for READ_SMS at all: a Play Store build has it
    // removed, and then the button should not be offered.
    Function("isAvailable") {
      val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.packageManager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
      } else {
        @Suppress("DEPRECATION")
        context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
      }
      info.requestedPermissions?.contains(Manifest.permission.READ_SMS) == true
    }

    AsyncFunction("readMessages") { senders: List<String>, fromMs: Double, toMs: Double, limit: Int ->
      if (context.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
        throw CodedException("NO_PERMISSION", "Jamvi has not been allowed to read messages.", null)
      }
      val wanted = senders.map { it.uppercase() }.toSet()
      val found = mutableListOf<Map<String, Any>>()
      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
        "${Telephony.Sms.DATE} >= ? AND ${Telephony.Sms.DATE} < ?",
        arrayOf(fromMs.toLong().toString(), toMs.toLong().toString()),
        "${Telephony.Sms.DATE} ASC",
      )?.use { cursor ->
        val address = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val body = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val date = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (cursor.moveToNext() && found.size < limit) {
          // Senders are matched here, not in the query: an inbox spells
          // "MPESA" with spaces or dashes depending on the phone.
          val from = (cursor.getString(address) ?: "").uppercase().replace(Regex("[^A-Z0-9]"), "")
          if (from !in wanted) continue
          found.add(mapOf("address" to from, "body" to (cursor.getString(body) ?: ""), "date" to cursor.getLong(date).toDouble()))
        }
      }
      found
    }
  }
}
