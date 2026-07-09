package io.agora.media;

import java.io.ByteArrayOutputStream;
import java.security.SecureRandom;
import java.util.Date;
import java.util.zip.Deflater;
import java.util.zip.Inflater;

import org.apache.commons.codec.binary.Base64;

public class Utils {
    public static final long HMAC_SHA256_LENGTH = 32;
    public static final int VERSION_LENGTH = 3;
    public static final int APP_ID_LENGTH = 32;

    public static String base64Encode(byte[] data) {
        byte[] encodedBytes = Base64.encodeBase64(data);
        return new String(encodedBytes);
    }

    public static byte[] base64Decode(String data) {
        return Base64.decodeBase64(data.getBytes());
    }

    public static int getTimestamp() {
        return (int) ((new Date().getTime()) / 1000);
    }

    public static int randomInt() {
        return new SecureRandom().nextInt();
    }

    public static boolean isUUID(String uuid) {
        if (uuid.length() != 32) {
            return false;
        }

        return uuid.matches("\\p{XDigit}+");
    }

    public static byte[] compress(byte[] data) {
        byte[] output;
        Deflater deflater = new Deflater();
        ByteArrayOutputStream bos = new ByteArrayOutputStream(data.length);

        try {
            deflater.reset();
            deflater.setInput(data);
            deflater.finish();

            byte[] buf = new byte[data.length];
            while (!deflater.finished()) {
                int i = deflater.deflate(buf);
                bos.write(buf, 0, i);
            }
            output = bos.toByteArray();
        } catch (Exception e) {
            output = data;
            e.printStackTrace();
        } finally {
            deflater.end();
        }

        return output;
    }

    public static byte[] decompress(byte[] data) {
        Inflater inflater = new Inflater();
        ByteArrayOutputStream bos = new ByteArrayOutputStream(data.length);

        try {
            inflater.setInput(data);
            byte[] buf = new byte[8192];
            int len;

            while ((len = inflater.inflate(buf)) > 0) {
                bos.write(buf, 0, len);
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            inflater.end();
        }

        return bos.toByteArray();
    }
}
