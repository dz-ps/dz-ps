// Utilidades H.264: Annex B ↔ AVCC, avcC record, string de codec.

public enum H264 {
    public static let nalSPS: UInt8 = 7
    public static let nalPPS: UInt8 = 8
    public static let nalIDR: UInt8 = 5
    public static let nalSlice: UInt8 = 1
    public static let nalAUD: UInt8 = 9

    @inlinable public static func nalType(_ nal: ArraySlice<UInt8>) -> UInt8 {
        nal.first.map { $0 & 0x1F } ?? 0
    }

    /// Slice com first_mb_in_slice == 0 (início de um novo frame).
    public static func isFirstSliceOfPicture(_ nal: ArraySlice<UInt8>) -> Bool {
        guard nal.count > 1 else { return false }
        return nal[nal.startIndex + 1] & 0x80 != 0
    }

    /// "avc1.PPCCLL" a partir do SPS (profile_idc, constraint flags, level_idc).
    public static func codecString(sps: [UInt8]) -> String? {
        guard sps.count >= 4 else { return nil }
        return "avc1." + sps[1...3].map { hex2($0) }.joined()
    }

    /// AVCDecoderConfigurationRecord (ISO/IEC 14496-15 §5.2.4.1) com lengthSizeMinusOne = 3.
    public static func avcC(sps: [[UInt8]], pps: [[UInt8]]) -> [UInt8]? {
        guard let s0 = sps.first, s0.count >= 4, !pps.isEmpty, sps.count < 32, pps.count < 256 else { return nil }
        var out: [UInt8] = [1, s0[1], s0[2], s0[3], 0xFF, 0xE0 | UInt8(sps.count)]
        for s in sps { out.append(UInt8(s.count >> 8)); out.append(UInt8(s.count & 0xFF)); out.append(contentsOf: s) }
        out.append(UInt8(pps.count))
        for p in pps { out.append(UInt8(p.count >> 8)); out.append(UInt8(p.count & 0xFF)); out.append(contentsOf: p) }
        return out
    }

    /// Divide um stream Annex B (start codes de 3 ou 4 bytes) em NAL units.
    public static func splitAnnexB(_ d: [UInt8]) -> [ArraySlice<UInt8>] {
        var nals: [ArraySlice<UInt8>] = []
        var i = 0
        var start = -1
        let n = d.count
        while i + 2 < n {
            if d[i] == 0, d[i + 1] == 0, d[i + 2] == 1 {
                if start >= 0 {
                    var end = i
                    // start code de 4 bytes: o zero anterior pertence ao start code
                    while end > start, d[end - 1] == 0 { end -= 1 }
                    if end > start { nals.append(d[start..<end]) }
                }
                i += 3
                start = i
            } else {
                i += 1
            }
        }
        if start >= 0, start < n { nals.append(d[start..<n]) }
        return nals
    }

    /// NALs → sample AVCC (prefixo de tamanho de 4 bytes big-endian).
    public static func avccSample<S: Sequence>(_ nals: S) -> [UInt8] where S.Element == ArraySlice<UInt8> {
        var out: [UInt8] = []
        for nal in nals {
            let c = UInt32(nal.count)
            out.append(contentsOf: [UInt8(c >> 24), UInt8((c >> 16) & 0xFF), UInt8((c >> 8) & 0xFF), UInt8(c & 0xFF)])
            out.append(contentsOf: nal)
        }
        return out
    }

    private static func hex2(_ b: UInt8) -> String {
        let digits = Array("0123456789ABCDEF")
        return String([digits[Int(b >> 4)], digits[Int(b & 0xF)]])
    }
}
