#include <jni.h>
#include <stdio.h>
#include <string.h>
#include "dwg.h"
#include "out_dxf.h"

JNIEXPORT jint JNICALL
Java_com_izcad_viewer_NativeDwgPlugin_convertFile(JNIEnv *env, jclass clazz,
                                                    jstring input, jstring output) {
    (void)clazz;
    const char *src = (*env)->GetStringUTFChars(env, input, NULL);
    const char *dst = (*env)->GetStringUTFChars(env, output, NULL);
    if (!src || !dst) return -1;
    Dwg_Data dwg;
    Bit_Chain data;
    memset(&dwg, 0, sizeof(dwg));
    memset(&data, 0, sizeof(data));
    int status = dwg_read_file(src, &dwg);
    if (status < DWG_ERR_CRITICAL) {
        data.version = dwg.header.version;
        data.from_version = dwg.header.from_version;
        data.fh = fopen(dst, "wb");
        if (data.fh) {
            status = dwg_write_dxf(&data, &dwg);
            fclose(data.fh);
        } else status = -2;
    }
    dwg_free(&dwg);
    (*env)->ReleaseStringUTFChars(env, input, src);
    (*env)->ReleaseStringUTFChars(env, output, dst);
    return status >= DWG_ERR_CRITICAL ? status : (status < 0 ? status : 0);
}
