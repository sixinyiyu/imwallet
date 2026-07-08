#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(Pbkdf2, NSObject)
RCT_EXTERN_METHOD(derive:(NSString *)password
                      salt:(NSString *)salt
                      iterations:(NSInteger)iterations
                      keyLength:(NSInteger)keyLength
                      hashAlg:(NSString *)hashAlg
                      resolve:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject)
@end
