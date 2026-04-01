import bcrypt from 'bcrypt';

export class Password {
    static async toHash( password: string ) {
        const hashedPassword = await bcrypt.hash( password, 10 );
        return hashedPassword;
    }

    static async compare( storedPasword: string, suppliedPassword: string ) {
        if (!suppliedPassword || !storedPasword) {
            throw new Error("Password or hash missing");
        }
        const passwordMatch = await bcrypt.compare( suppliedPassword, storedPasword );
        return passwordMatch;
    }
}