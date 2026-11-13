import Foundation
#if canImport(Darwin)
import Darwin
#endif

/// Memória do próprio processo (pra acompanhar o custo de cada display virtual).
public enum ProcessStats {
    /// "Memória" como o Monitor de Atividade mostra (phys_footprint) no macOS; RSS no Linux.
    public static func footprintMB() -> Double? {
        #if canImport(Darwin)
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let kr = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        return kr == KERN_SUCCESS ? Double(info.phys_footprint) / 1_048_576 : nil
        #else
        guard let s = try? String(contentsOfFile: "/proc/self/statm", encoding: .utf8),
              let pages = s.split(separator: " ").dropFirst().first.flatMap({ Double($0) }) else { return nil }
        return pages * Double(sysconf(Int32(_SC_PAGESIZE))) / 1_048_576
        #endif
    }
}
