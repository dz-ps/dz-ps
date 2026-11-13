#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

/// Relógio monotônico do host em µs. No macOS é o mesmo relógio do `mach_absolute_time`,
/// que é a base do `SCStreamFrameInfo.displayTime`.
public enum HostClock {
    public static func nowMicros() -> UInt64 {
        #if canImport(Darwin)
        return clock_gettime_nsec_np(CLOCK_UPTIME_RAW) / 1000
        #else
        var ts = timespec()
        clock_gettime(CLOCK_MONOTONIC, &ts)
        return UInt64(ts.tv_sec) * 1_000_000 + UInt64(ts.tv_nsec) / 1000
        #endif
    }

    #if canImport(Darwin)
    private static let timebase: mach_timebase_info_data_t = {
        var tb = mach_timebase_info_data_t()
        mach_timebase_info(&tb)
        return tb
    }()

    /// Converte ticks de `mach_absolute_time` para µs.
    public static func machToMicros(_ t: UInt64) -> UInt64 {
        let tb = timebase
        return t.multipliedFullWidth(by: UInt64(tb.numer)).low / UInt64(tb.denom) / 1000
    }
    #endif
}
