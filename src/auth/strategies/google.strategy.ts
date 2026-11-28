import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private authService: AuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const email: string | undefined = profile.emails?.[0]?.value;
    const name: string =
      profile.displayName ||
      `${profile.name?.givenName ?? ''} ${profile.name?.familyName ?? ''}`.trim() ||
      'Google User';
    const avatarUrl: string | undefined = profile.photos?.[0]?.value;
    const googleId: string = profile.id;

    try {
      const result = await this.authService.googleOAuthLogin({
        googleId,
        email,
        name,
        avatarUrl,
      });
      done(null, result as any);
    } catch (err: any) {
      done(err, false);
    }
  }
}
