export class AuthResponseDto {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    phoneNumber?: string;
    profileImage?: string | null;
  };
}
