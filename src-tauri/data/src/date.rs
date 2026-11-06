//! Date-only values and event timestamps.
//!
//! Deadlines and due dates are calendar dates (`YYYY-MM-DD`), never UTC-midnight
//! instants, so they cannot drift across time zones. Timestamps record when an event
//! actually happened and are stored as RFC 3339 UTC strings with millisecond precision.

use std::time::{SystemTime, UNIX_EPOCH};

/// Returns true for a real Gregorian calendar date written exactly as `YYYY-MM-DD`.
/// Years are limited to 1000–9999 so the text form always sorts chronologically.
pub fn is_calendar_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let digits = |range: std::ops::Range<usize>| -> Option<u32> {
        let part = &value[range];
        if part.bytes().all(|b| b.is_ascii_digit()) {
            part.parse().ok()
        } else {
            None
        }
    };
    let (Some(year), Some(month), Some(day)) = (digits(0..4), digits(5..7), digits(8..10)) else {
        return false;
    };
    (1000..=9999).contains(&year)
        && (1..=12).contains(&month)
        && day >= 1
        && day <= days_in_month(year, month)
}

fn is_leap(year: u32) -> bool {
    (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
}

fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap(year) => 29,
        2 => 28,
        _ => 0,
    }
}

/// Returns true for a timestamp in exactly the form this crate writes:
/// `YYYY-MM-DDTHH:MM:SS.mmmZ` with a real date and in-range time.
pub fn is_timestamp(value: &str) -> bool {
    let b = value.as_bytes();
    if b.len() != 24
        || b[10] != b'T'
        || b[13] != b':'
        || b[16] != b':'
        || b[19] != b'.'
        || b[23] != b'Z'
    {
        return false;
    }
    let number = |range: std::ops::Range<usize>| -> Option<u32> {
        let part = &value[range];
        part.bytes()
            .all(|c| c.is_ascii_digit())
            .then(|| part.parse().ok())
            .flatten()
    };
    matches!(
        (number(11..13), number(14..16), number(17..19), number(20..23)),
        (Some(h), Some(m), Some(s), Some(_)) if h < 24 && m < 60 && s < 60
    ) && is_calendar_date(&value[..10])
}

/// Current time as `YYYY-MM-DDTHH:MM:SS.mmmZ`.
pub fn now_timestamp() -> String {
    let since = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format_timestamp(since.as_millis() as i64)
}

/// Formats milliseconds since the Unix epoch as an RFC 3339 UTC timestamp.
pub fn format_timestamp(millis: i64) -> String {
    let days = millis.div_euclid(86_400_000);
    let in_day = millis.rem_euclid(86_400_000);
    let (year, month, day) = civil_from_days(days);
    let (hours, minutes, seconds, ms) = (
        in_day / 3_600_000,
        in_day / 60_000 % 60,
        in_day / 1000 % 60,
        in_day % 1000,
    );
    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}.{ms:03}Z")
}

/// Howard Hinnant's days-to-civil conversion for the proleptic Gregorian calendar.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_real_calendar_dates() {
        for ok in [
            "2026-11-06",
            "2028-02-29",
            "2000-02-29",
            "1000-01-01",
            "9999-12-31",
        ] {
            assert!(is_calendar_date(ok), "{ok}");
        }
        for bad in [
            "",
            "2026-2-01",
            "2026-02-29",
            "1900-02-29",
            "2026-13-01",
            "2026-00-10",
            "2026-04-31",
            "2026-01-00",
            "0999-01-01",
            "2026-11-06T00:00:00Z",
            " 2026-11-06",
            "2026/11/06",
            "２０２６-11-06",
            "+026-11-06",
        ] {
            assert!(!is_calendar_date(bad), "{bad:?}");
        }
    }

    #[test]
    fn formats_utc_timestamps() {
        assert_eq!(format_timestamp(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(
            format_timestamp(951_782_400_000),
            "2000-02-29T00:00:00.000Z"
        );
        assert_eq!(
            format_timestamp(1_793_960_096_789),
            "2026-11-06T10:14:56.789Z"
        );
        assert_eq!(format_timestamp(-1), "1969-12-31T23:59:59.999Z");
        assert_eq!(now_timestamp().len(), 24);
        assert!(is_timestamp(&now_timestamp()));
        assert!(is_timestamp("2028-02-29T23:59:59.999Z"));
        for bad in [
            "2026-02-29T00:00:00.000Z",
            "2026-11-06T24:00:00.000Z",
            "2026-11-06T10:14:56Z",
            "2026-11-06 10:14:56.789Z",
            "2026-11-06T10:60:00.000+00:00",
        ] {
            assert!(!is_timestamp(bad), "{bad}");
        }
    }
}
