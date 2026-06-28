#import "SecureScreenModule.h"
#import <UIKit/UIKit.h>

@implementation RCT_SECURE_SCREEN_EXPORT

RCT_EXPORT_MODULE(SecureScreen);

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onScreenshot"];
}

- (void)startObserving {
  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(screenshotTaken:)
                                               name:UIApplicationUserDidTakeScreenshotNotification
                                             object:nil];
}

- (void)stopObserving {
  [[NSNotificationCenter defaultCenter] removeObserver:self
                                                  name:UIApplicationUserDidTakeScreenshotNotification
                                                object:nil];
}

- (void)screenshotTaken:(NSNotification *)notification {
  [self sendEventWithName:@"onScreenshot" body:@{@"type": @"screenshot"}];
}

RCT_EXPORT_METHOD(enable) {
  // iOS has no system API to prevent screenshots/recordings.
  // We only detect and warn the user via onScreenshot event.
  // Calling enable starts the screenshot observer.
  dispatch_async(dispatch_get_main_queue(), ^{
    [self startObserving];
  });
}

RCT_EXPORT_METHOD(disable) {
  // Stop observing screenshots when leaving secure screen.
  dispatch_async(dispatch_get_main_queue(), ^{
    [self stopObserving];
  });
}

@end
