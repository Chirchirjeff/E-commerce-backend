import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private static readonly logger = new Logger('GoogleStrategy');

  constructor(private authService: AuthService) {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL = process.env.GOOGLE_CALLBACK_URL;

    if (!clientID || !clientSecret || !callbackURL) {
      GoogleStrategy.logger.warn(
        'Google OAuth credentials are not configured. ' +
        'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALLBACK_URL ' +
        'in your environment variables. Google sign-in will be unavailable.',
      );
    }

    super({
      // Fall back to placeholder values so the server starts even without
      // credentials — the endpoints will return 500 if actually called.
      clientID: clientID ?? 'unconfigured',
      clientSecret: clientSecret ?? 'unconfigured',
      callbackURL: callbackURL ?? 'http://localhost:4000/auth/google/callback',
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
