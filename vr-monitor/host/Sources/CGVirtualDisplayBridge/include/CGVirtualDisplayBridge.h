// Declarações da API privada CGVirtualDisplay (CoreGraphics), a mesma usada pelo DeskPad.
// Não há header público: estas interfaces descrevem as classes que existem em runtime.
//
// Tudo é `weak_import`: se uma versão futura do macOS remover as classes, o binário ainda abre
// (o símbolo vira nil) e o host checa `NSClassFromString` antes de usar.
#pragma once

#if defined(__APPLE__) && defined(__OBJC__)
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@class CGVirtualDisplay;

__attribute__((weak_import))
@interface CGVirtualDisplayMode : NSObject
@property(readonly, nonatomic) CGFloat refreshRate;
@property(readonly, nonatomic) NSUInteger width;
@property(readonly, nonatomic) NSUInteger height;
- (instancetype)initWithWidth:(NSUInteger)width height:(NSUInteger)height refreshRate:(CGFloat)refreshRate
    NS_SWIFT_NAME(init(width:height:refreshRate:));
@end

__attribute__((weak_import))
@interface CGVirtualDisplaySettings : NSObject
@property(retain, nonatomic) NSArray<CGVirtualDisplayMode *> *modes;
@property(nonatomic) unsigned int hiDPI;
- (instancetype)init;
@end

__attribute__((weak_import))
@interface CGVirtualDisplayDescriptor : NSObject
@property(retain, nonatomic) NSString *name;
@property(nonatomic) unsigned int maxPixelsHigh;
@property(nonatomic) unsigned int maxPixelsWide;
@property(nonatomic) CGSize sizeInMillimeters;
@property(nonatomic) unsigned int serialNum;
@property(nonatomic) unsigned int productID;
@property(nonatomic) unsigned int vendorID;
@property(copy, nonatomic, nullable) void (^terminationHandler)(id _Nullable, CGVirtualDisplay * _Nullable);
- (instancetype)init;
- (void)setDispatchQueue:(dispatch_queue_t)queue NS_SWIFT_NAME(setDispatchQueue(_:));
@end

__attribute__((weak_import))
@interface CGVirtualDisplay : NSObject
@property(readonly, nonatomic) CGDirectDisplayID displayID;
@property(readonly, nonatomic) unsigned int hiDPI;
@property(readonly, nonatomic) NSString *name;
- (nullable instancetype)initWithDescriptor:(CGVirtualDisplayDescriptor *)descriptor NS_SWIFT_NAME(init(descriptor:));
- (BOOL)applySettings:(CGVirtualDisplaySettings *)settings NS_SWIFT_NAME(applySettings(_:));
@end

NS_ASSUME_NONNULL_END
#endif
