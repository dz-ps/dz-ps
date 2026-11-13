import Foundation
import Testing
@testable import HostCore

@Suite struct SyntheticStreamTests {
    static let clip = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("test-clip.h264").path

    @Test(.enabled(if: FileManager.default.fileExists(atPath: clip), "gere com scripts/make-test-clip.sh"))
    func parsesClipIntoAccessUnits() throws {
        let s = try SyntheticStream(displayId: 1, clipPath: Self.clip, width: 1280, height: 800, fps: 60)
        // 6 s a 60 fps, um frame por access unit mesmo com vários slices por frame
        #expect(s.frameCount == 360)
    }

    @Test(.enabled(if: FileManager.default.fileExists(atPath: clip)))
    func emitsConfigBeforeEveryKeyframe() async throws {
        let s = try SyntheticStream(displayId: 1, clipPath: Self.clip, width: 1280, height: 800, fps: 120)
        let box = UnitBox()
        try await s.start { box.append($0) }
        try await Task.sleep(for: .milliseconds(700))
        await s.stop()
        let units = box.all
        #expect(units.count > 40)
        guard case .config(let c, _) = units[0] else { Issue.record("primeira unidade não é config"); return }
        #expect(c.codec.hasPrefix("avc1.64"))
        for (i, u) in units.enumerated() {
            if case .frame(_, let key, _, _) = u, key {
                guard i > 0, case .config = units[i - 1] else { Issue.record("keyframe sem config antes (i=\(i))"); return }
            }
        }
    }
}

final class UnitBox: @unchecked Sendable {
    private let lock = NSLock()
    private var units: [EncodedUnit] = []
    func append(_ u: EncodedUnit) { lock.withLock { units.append(u) } }
    var all: [EncodedUnit] { lock.withLock { units } }
}
