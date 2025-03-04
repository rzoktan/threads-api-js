import axios, { AxiosRequestConfig } from 'axios';
import * as crypto from 'crypto';
import 'dotenv/config';
import mimeTypes from 'mrmime';
import { v4 as uuidv4 } from 'uuid';
import {
  POST_URL,
  POST_WITH_IMAGE_URL,
  DEFAULT_LSD_TOKEN,
  DEFAULT_DEVICE_ID,
  BASE_API_URL,
  LOGIN_EXPERIMENTS,
  SIGNATURE_KEY,
} from './constants';
import { LATEST_ANDROID_APP_VERSION } from './dynamic-data';
import { Extensions, Thread, ThreadsUser } from './threads-types';

export type AndroidDevice = {
  manufacturer: string;
  model: string;
  os_version: number;
  os_release: string;
};

export type ErrorResponse = {
  status: 'error'; // ?
  error_title: string;
};
export type GetUserProfileResponse = {
  data: {
    userData: {
      user: ThreadsUser;
    };
  };
  extensions: Extensions;
};

export type GetUserProfileThreadsResponse = {
  data: {
    mediaData?: {
      threads: Thread[];
    };
  };
  extensions: Extensions;
};
export type GetUserProfileThreadsPaginatedResponse = {
  status: 'ok';
  next_max_id: string;
  medias: [];
  threads: Thread[];
};

export type GetUserProfileThreadResponse = {
  data: {
    data: {
      containing_thread: Thread;
      reply_threads?: Thread[];
    };
  };
  extensions: Extensions;
};

export type GetThreadLikersResponse = {
  data: {
    likers: {
      users: ThreadsUser[];
    };
  };
  extensions: Extensions;
};

export type GetTimelineResponse = {
  num_results: number;
  more_available: boolean;
  auto_load_more_enabled: boolean;
  is_direct_v2_enabled: boolean;
  next_max_id: string;
  view_state_version: string;
  client_feed_changelist_applied: boolean;
  request_id: string;
  pull_to_refresh_window_ms: number;
  preload_distance: number;
  status: string;
  pagination_source: string;
  hide_like_and_view_counts: number;
  is_shell_response: boolean;
  items: Thread[];
  feed_items_media_info: Array<any>;
};

export type InstagramImageUploadResponse = {
  upload_id: string;
  xsharing_nonces: {};
  status: 'ok';
};

export type FriendshipStatusResponse = {
  friendship_status: {
    following: boolean;
    followed_by: boolean;
    blocking: boolean;
    muting: boolean;
    is_private: boolean;
    incoming_request: boolean;
    outgoing_request: boolean;
    text_post_app_pre_following: boolean;
    is_bestie: boolean;
    is_restricted: boolean;
    is_feed_favorite: boolean;
    is_eligible_to_subscribe: boolean;
  };
  status: 'ok';
};

export type ThreadsAPIOptions = {
  verbose?: boolean;
  token?: string;
  fbLSDToken?: string;

  noUpdateToken?: boolean;
  noUpdateLSD?: boolean;

  httpAgent?: AxiosRequestConfig['httpAgent'];
  httpsAgent?: AxiosRequestConfig['httpsAgent'];

  username?: string;
  password?: string;
  deviceID?: string;
  device?: AndroidDevice;
  userID?: string;
  locale?: string;
  maxRetries?: number;
};

export type ThreadsAPIPublishOptions =
  | {
      text?: string;
      parentPostID?: string;
    } & ({ url?: string } | { image?: string | ThreadsAPIImage });

export type ThreadsAPIImage = { path: string } | { type: string; data: Buffer };

export const DEFAULT_DEVICE: AndroidDevice = {
  manufacturer: 'OnePlus',
  model: 'ONEPLUS+A3010',
  os_version: 25,
  os_release: '7.1.1',
};

interface UserIDQuerier<T extends any> {
  (userID: string, options?: AxiosRequestConfig): Promise<T>;

  // deprecated
  (username: string, userID: string, options?: AxiosRequestConfig): Promise<T>;
}

interface PaginationUserIDQuerier<T extends any> {
  (userID: string, cursor?: string, options?: AxiosRequestConfig): Promise<T>;
}

export class ThreadsAPI {
  verbose: boolean = false;
  token?: string = undefined;
  fbLSDToken: string = DEFAULT_LSD_TOKEN;

  noUpdateToken: boolean = false;
  noUpdateLSD: boolean = false;

  httpAgent?: AxiosRequestConfig['httpAgent'];
  httpsAgent?: AxiosRequestConfig['httpsAgent'];

  username?: string;
  password?: string;
  deviceID: string = DEFAULT_DEVICE_ID;
  device?: AndroidDevice = DEFAULT_DEVICE;

  userID: string | undefined = undefined;

  locale?: string | undefined = undefined;

  maxRetries?: number = 1;

  constructor(options?: ThreadsAPIOptions) {
    if (options?.token) this.token = options.token;
    if (options?.fbLSDToken) this.fbLSDToken = options.fbLSDToken;

    this.noUpdateToken = !!options?.noUpdateToken;
    this.noUpdateLSD = !!options?.noUpdateLSD;

    this.verbose = options?.verbose || false;
    this.httpAgent = options?.httpAgent;
    this.httpsAgent = options?.httpsAgent;

    this.username = options?.username ?? process.env.THREADS_USERNAME;
    this.password = options?.password ?? process.env.THREADS_PASSWORD;

    if (options?.deviceID) this.deviceID = options.deviceID;
    if (process.env.THREADS_DEVICE_ID) this.deviceID = process.env.THREADS_DEVICE_ID;

    if (options?.deviceID ?? process.env.THREADS_DEVICE_ID) {
      console.warn(
        `⚠️ WARNING: deviceID not provided, automatically generating device id '${this.deviceID}'`,
        'Please save this device id and use it for future uses to prevent login issues.',
        'You can provide this device id by passing it to the constructor or setting the THREADS_DEVICE_ID environment variable (.env file)',
      );
    }

    this.device = options?.device;
    this.userID = options?.userID;

    if (options?.locale) {
      this.locale = options.locale;
    } else {
      const detectedLocale: string = Intl.DateTimeFormat().resolvedOptions().locale;
      this.locale = detectedLocale;
    }

    this.maxRetries = options?.maxRetries || this.maxRetries;
  }

  sign(payload: object | string) {
    const json = typeof payload === 'object' ? JSON.stringify(payload) : payload;
    const signature = crypto.createHmac('sha256', SIGNATURE_KEY).update(json).digest('hex');
    return {
      ig_sig_key_version: 4,
      signed_body: `${signature}.${json}`,
    };
  }

  syncLoginExperiments = async () => {
    const uid = uuidv4();
    const data = {
      id: uid,
      experiments: LOGIN_EXPERIMENTS,
    };
    try {
      const res = await axios.post(`${BASE_API_URL}/api/v1/qe/sync/`, this.sign(data), {
        headers: {
          ...this._getAppHeaders(),
          Authorization: undefined,
          'Sec-Fetch-Site': 'same-origin',
          'X-DEVICE-ID': uid,
        },
      });
      return res;
    } catch (error: any) {
      if (this.verbose) {
        console.log('[SYNC LOGIN EXPERIMENT FAILED]', error.response.data);
      }
      throw Error('Sync login experiment failed');
    }
  };

  encryptPassword = async (password: string) => {
    // https://github.com/dilame/instagram-private-api/blob/master/src/repositories/account.repository.ts#L79
    const randKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const { headers } = await this.syncLoginExperiments();

    if (this.verbose) {
      console.log('[SYNC LOGIN EXPERIMENT HEADERS]', JSON.stringify(headers));
    }

    const passwordEncryptionKeyID: number | undefined = headers['ig-set-password-encryption-key-id'];
    const passwordEncryptionPubKey: string | undefined = headers['ig-set-password-encryption-pub-key'];

    const rsaEncrypted = crypto.publicEncrypt(
      {
        key: Buffer.from(passwordEncryptionPubKey || '', 'base64').toString(),
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      randKey,
    );
    const cipher = crypto.createCipheriv('aes-256-gcm', randKey, iv);
    const time = Math.floor(Date.now() / 1000).toString();
    cipher.setAAD(Buffer.from(time));

    const aesEncrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
    const sizeBuffer = Buffer.alloc(2, 0);
    sizeBuffer.writeInt16LE(rsaEncrypted.byteLength, 0);

    const authTag = cipher.getAuthTag();
    return {
      time,
      password: Buffer.concat([
        Buffer.from([1, passwordEncryptionKeyID || 0]),
        iv,
        sizeBuffer,
        rsaEncrypted,
        authTag,
        aesEncrypted,
      ]).toString('base64'),
    };
  };

  login = async () => {
    let retries = 0;

    const _login = async () => {
      if (this.verbose) {
        console.log('[LOGIN] Logging in...');
      }
      const encryptedPassword = await this.encryptPassword(this.password!);

      const params = encodeURIComponent(
        JSON.stringify({
          client_input_params: {
            password: `#PWD_INSTAGRAM:4:${encryptedPassword.time}:${encryptedPassword.password}`,
            contact_point: this.username,
            device_id: this.deviceID,
          },
          server_params: {
            credential_type: 'password',
            device_id: this.deviceID,
          },
        }),
      );

      const blockVersion = '5f56efad68e1edec7801f630b5c122704ec5378adbee6609a448f105f34a9c73';
      const bkClientContext = encodeURIComponent(
        JSON.stringify({
          bloks_version: blockVersion,
          styles_id: 'instagram',
        }),
      );
      const requestConfig: AxiosRequestConfig = {
        method: 'POST',
        headers: this._getAppHeaders(),
        responseType: 'text',
        data: `params=${params}&bk_client_context=${bkClientContext}&bloks_versioning_id=${blockVersion}`,
      };

      let { data } = await axios<string>(
        `${BASE_API_URL}/api/v1/bloks/apps/com.bloks.www.bloks.caa.login.async.send_login_request/`,
        requestConfig,
      );
      data = JSON.stringify(data.replaceAll('\\', ''));

      if (this.verbose) {
        console.log('[LOGIN] Cleaned output', data);
      }

      try {
        const token = data.split('Bearer IGT:2:')[1].split('"')[0].replaceAll('\\', '');
        const userID = data.match(/pk_id":"(\d+)/)?.[1];

        if (!this.noUpdateToken) {
          if (this.verbose) {
            console.debug('[token] UPDATED', token);
          }
          this.token = token;
        }

        this.userID = userID;
        if (this.verbose) {
          console.debug('[userID] UPDATED', this.userID);
        }

        return { token, userID };
      } catch (error) {
        if (this.verbose) {
          console.error('[LOGIN] Failed to login', error);
        }
        throw Error('Login Failed');
      }
    };

    // try to login maxRetries times
    while (retries < this.maxRetries!) {
      try {
        return _login();
      } catch (error) {
        if (this.verbose) {
          console.error(`[LOGIN] Failed to login, retrying... (${retries + 1}/${this.maxRetries})`);
        }
        const delay = Math.pow(2, retries) * 1000; // exponential backoff with base 2
        await new Promise((resolve) => setTimeout(resolve, delay));
        retries++;
      }
    }

    throw new Error(`[LOGIN] Failed to login after ${this.maxRetries} retries`);
  };

  _getAppHeaders = () => ({
    'User-Agent': `Barcelona ${LATEST_ANDROID_APP_VERSION} Android`,
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    ...(this.token && { Authorization: `Bearer IGT:2:${this.token}` }),
  });

  _getInstaHeaders = () => ({
    ...this._getAppHeaders(),
    ...(this.userID && { 'Ig-U-Ds-User-Id': this.userID, 'Ig-Intended-User-Id': this.userID }),
  });

  _getDefaultHeaders = (username?: string) => ({
    ...this._getAppHeaders(),
    authority: 'www.threads.net',
    accept: '*/*',
    'accept-language': this.locale,
    'cache-control': 'no-cache',
    origin: 'https://www.threads.net',
    pragma: 'no-cache',
    'Sec-Fetch-Site': 'same-origin',
    'x-asbd-id': '129477',
    'x-fb-lsd': this.fbLSDToken,
    'x-ig-app-id': '238260118697367',
    ...(!!username ? { referer: `https://www.threads.net/@${username}` } : undefined),
  });

  getProfilePage = async (url: string, username: string, options?: AxiosRequestConfig) => {
    const res = await axios.get(`${url}${username}`, {
      ...options,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      headers: {
        ...this._getDefaultHeaders(username),
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'ko,en;q=0.9,ko-KR;q=0.8,ja;q=0.7',
        Authorization: undefined,
        referer: 'https://www.instagram.com/',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': `navigate`,
        'sec-fetch-site': `cross-site`,
        'sec-fetch-user': `?1`,
        'upgrade-insecure-requests': `1`,
        'x-asbd-id': undefined,
        'x-fb-lsd': undefined,
        'x-ig-app-id': undefined,
      },
    });

    // let text: string = (await res.text())
    let text: string = res.data;
    // remove ALL whitespaces from text
    text = text.replace(/\s/g, '');
    // remove all newlines from text
    text = text.replace(/\n/g, '');

    return text;
  };

  getUserIDfromUsernameWithInstagram = async (
    username: string,
    options?: AxiosRequestConfig,
  ): Promise<string | undefined> => {
    const text = await this.getProfilePage('https://www.instagram.com/', username, options);

    const userID: string | undefined = text.match(/"user_id":"(\d+)",/)?.[1];
    const lsdToken: string | undefined = text.match(/"LSD",\[\],{"token":"(\w+)"},\d+\]/)?.[1];

    if (!this.noUpdateLSD && !!lsdToken) {
      this.fbLSDToken = lsdToken;
      if (this.verbose) {
        console.debug('[fbLSDToken] UPDATED', this.fbLSDToken);
      }
    }

    return userID;
  };

  getUserIDfromUsername = async (
    username: string,
    options?: AxiosRequestConfig,
  ): Promise<string | undefined> => {
    const text = await this.getProfilePage('https://www.threads.net/@', username, options);

    const userID: string | undefined = text.match(/"user_id":"(\d+)"/)?.[1];
    const lsdToken: string | undefined = text.match(/"LSD",\[\],{"token":"(\w+)"},\d+\]/)?.[1];

    if (!userID) {
      return this.getUserIDfromUsernameWithInstagram(username, options);
    }

    if (!this.noUpdateLSD && !!lsdToken) {
      this.fbLSDToken = lsdToken;
      if (this.verbose) {
        console.debug('[fbLSDToken] UPDATED', this.fbLSDToken);
      }
    }

    return userID;
  };
  getCurrentUserID = async (options?: AxiosRequestConfig) => {
    if (this.userID) {
      if (this.verbose) {
        console.debug('[userID] USING', this.userID);
      }
      return this.userID;
    }
    if (!this.username) {
      throw new Error('username is not defined');
    }
    try {
      this.userID = await this.getUserIDfromUsername(this.username, options);
      if (this.verbose) {
        console.debug('[userID] UPDATED', this.userID);
      }
      return this.userID;
    } catch (e) {
      if (this.verbose) {
        console.error('[userID] Failed to fetch userID, Fallbacking to login', e);
      }
      const { userID } = await this.login();
      return userID;
    }
  };

  _requestQuery = <T extends any>(
    url: string,
    data: Record<string, string | undefined>,
    options?: AxiosRequestConfig,
  ) => {
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    return axios.post<T>(url, new URLSearchParams(data as Record<string, string>), {
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      headers: this._getDefaultHeaders(),
      ...options,
    });
  };

  _destructureFromUserIDQuerier = (params: any) => {
    const typedParams = params as
      | [string]
      | [string, AxiosRequestConfig | undefined]
      | [string, string] // old
      | [string, string, AxiosRequestConfig | undefined]; // old
    let userID: string;
    let options: AxiosRequestConfig | undefined;
    if (typeof typedParams[0] === 'string' && typeof typedParams[1] === 'string') {
      // old
      // username = typedParams[0]
      userID = typedParams[1];
      options = typedParams[2];
    } else {
      userID = typedParams[0];
      options = typedParams[1] as AxiosRequestConfig | undefined;
    }
    return { userID, options };
  };

  getUserProfile: UserIDQuerier<ThreadsUser> = async (...params) => {
    const { userID, options } = this._destructureFromUserIDQuerier(params);
    if (this.verbose) {
      console.debug('[fbLSDToken] USING', this.fbLSDToken);
    }

    const res = await this._requestQuery<GetUserProfileResponse>(
      'https://www.threads.net/api/graphql',
      {
        lsd: this.fbLSDToken,
        variables: JSON.stringify({ userID }),
        doc_id: '23996318473300828',
      },
      options,
    );
    const user = res.data.data.userData.user;
    return user;
  };

  getUserProfileThreads: UserIDQuerier<Thread[]> = async (...params) => {
    const { userID, options } = this._destructureFromUserIDQuerier(params);
    if (this.verbose) {
      console.debug('[fbLSDToken] USING', this.fbLSDToken);
    }

    const res = await this._requestQuery<GetUserProfileThreadsResponse>(
      'https://www.threads.net/api/graphql',
      {
        lsd: this.fbLSDToken,
        variables: JSON.stringify({ userID }),
        doc_id: '6232751443445612',
      },
      options,
    );
    const threads = res.data.data?.mediaData?.threads || [];
    return threads;
  };

  getUserProfileThreadsLoggedIn: PaginationUserIDQuerier<GetUserProfileThreadsPaginatedResponse> = async (
    userID,
    maxID = '',
    options = {},
  ): Promise<GetUserProfileThreadsPaginatedResponse> => {
    if (!this.token) {
      await this.getToken();
    }
    if (!this.token) {
      throw new Error('Token not found');
    }

    let data: GetUserProfileThreadsPaginatedResponse | ErrorResponse | undefined = undefined;
    try {
      const res = await axios.get<GetUserProfileThreadsPaginatedResponse | ErrorResponse>(
        `${BASE_API_URL}/api/v1/text_feed/${userID}/profile/${maxID && `?max_id=${maxID}`}`,
        { ...options, headers: { ...this._getInstaHeaders(), ...options?.headers } },
      );
      data = res.data;
    } catch (error: any) {
      data = error.response?.data;
    }
    if (data?.status !== 'ok') {
      if (this.verbose) {
        console.log('[USER FEED] Failed to fetch', data);
      }
      throw new Error('Failed to fetch user feed: ' + JSON.stringify(data));
    }
    return data;
  };

  getUserProfileReplies: UserIDQuerier<Thread[]> = async (...params) => {
    const { userID, options } = this._destructureFromUserIDQuerier(params);
    if (this.verbose) {
      console.debug('[fbLSDToken] USING', this.fbLSDToken);
    }

    const res = await this._requestQuery<GetUserProfileThreadsResponse>(
      'https://www.threads.net/api/graphql',
      {
        lsd: this.fbLSDToken,
        variables: JSON.stringify({ userID }),
        doc_id: '6684830921547925',
      },
      options,
    );
    const threads = res.data.data?.mediaData?.threads || [];
    return threads;
  };

  getUserProfileRepliesLoggedIn: PaginationUserIDQuerier<GetUserProfileThreadsPaginatedResponse> = async (
    userID,
    maxID = '',
    options = {},
  ): Promise<GetUserProfileThreadsPaginatedResponse> => {
    if (!this.token) {
      await this.getToken();
    }
    if (!this.token) {
      throw new Error('Token not found');
    }

    let data: GetUserProfileThreadsPaginatedResponse | ErrorResponse | undefined = undefined;
    try {
      const res = await axios.get<GetUserProfileThreadsPaginatedResponse | ErrorResponse>(
        `https://i.instagram.com/api/v1/text_feed/${userID}/profile/replies/${maxID && `?max_id=${maxID}`}`,
        { ...options, headers: { ...this._getInstaHeaders(), ...options?.headers } },
      );
      data = res.data;
    } catch (error: any) {
      data = error.response?.data;
    }
    if (data?.status !== 'ok') {
      if (this.verbose) {
        console.log('[USER FEED] Failed to fetch', data);
      }
      throw new Error('Failed to fetch user feed: ' + JSON.stringify(data));
    }
    return data;
  };

  getPostIDfromThreadID = async (
    threadID: string,
    options?: AxiosRequestConfig,
  ): Promise<string | undefined> => {
    threadID = threadID.split('?')[0];
    threadID = threadID.replace(/\s/g, '');
    threadID = threadID.replace(/\//g, '');
    const postURL = `https://www.threads.net/t/${threadID}`;
    return this.getPostIDfromURL(postURL, options);
  };

  getPostIDfromURL = async (postURL: string, options?: AxiosRequestConfig): Promise<string | undefined> => {
    const res = await axios.get(postURL, {
      ...options,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
    });

    let text: string = res.data;
    text = text.replace(/\s/g, '');
    text = text.replace(/\n/g, '');

    const postID: string | undefined = text.match(/{"post_id":"(.*?)"}/)?.[1];
    const lsdToken: string | undefined = text.match(/"LSD",\[\],{"token":"(\w+)"},\d+\]/)?.[1];

    if (!this.noUpdateLSD && !!lsdToken) {
      this.fbLSDToken = lsdToken;
      if (this.verbose) {
        console.debug('[fbLSDToken] UPDATED', this.fbLSDToken);
      }
    }

    return postID;
  };

  getThreads = async (postID: string, options?: AxiosRequestConfig) => {
    if (this.verbose) {
      console.debug('[fbLSDToken] USING', this.fbLSDToken);
    }

    const res = await this._requestQuery<GetUserProfileThreadResponse>(
      'https://www.threads.net/api/graphql',
      {
        lsd: this.fbLSDToken,
        variables: JSON.stringify({ postID }),
        doc_id: '5587632691339264',
      },
      options,
    );
    const thread = res.data.data.data;
    return thread;
  };

  getThreadLikers = async (postID: string, options?: AxiosRequestConfig) => {
    if (this.verbose) {
      console.debug('[fbLSDToken] USING', this.fbLSDToken);
    }

    const res = await this._requestQuery<GetThreadLikersResponse>(
      'https://www.threads.net/api/graphql',
      {
        lsd: this.fbLSDToken,
        variables: JSON.stringify({ mediaID: postID }),
        doc_id: '9360915773983802',
      },
      options,
    );
    const likers = res.data.data.likers;
    return likers;
  };

  getTimeline = async (maxID: string = '', options?: AxiosRequestConfig): Promise<GetTimelineResponse> => {
    if (!this.token && (!this.username || !this.password)) {
      throw new Error('Username or password not set');
    }

    const token = await this.getToken();
    if (!token) {
      throw new Error('Token not found');
    }

    try {
      const res = await this._requestQuery<GetTimelineResponse>(
        `${BASE_API_URL}/api/v1/feed/text_post_app_timeline/`,
        { pagination_source: 'text_post_feed_threads', max_id: maxID || undefined },
        { ...options, headers: this._getAppHeaders() },
      );
      return res.data;
    } catch (error: any) {
      if (this.verbose) {
        console.log('[TIMELINE FETCH FAILED]', error.response.data);
      }
      throw Error('Failed to fetch timeline');
    }
  };

  _toggleAuthPostRequest = async <T extends any>(
    url: string,
    data?: Record<string, string>,
    options?: AxiosRequestConfig,
  ) => {
    const token = await this.getToken();
    if (!token) {
      throw new Error('Token not found');
    }
    const res = await axios.post<T>(url, !data ? undefined : new URLSearchParams(data), {
      ...options,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      headers: this._getDefaultHeaders(),
    });
    return res;
  };
  like = async (postID: string, options?: AxiosRequestConfig) => {
    const userID = await this.getCurrentUserID();
    const res = await this._toggleAuthPostRequest<{ status: 'ok' | string }>(
      `${BASE_API_URL}/api/v1/media/${postID}_${userID}/like/`,
      undefined,
      options,
    );
    return res.data.status === 'ok';
  };
  unlike = async (postID: string, options?: AxiosRequestConfig) => {
    const userID = await this.getCurrentUserID();
    const res = await this._toggleAuthPostRequest<{ status: 'ok' | string }>(
      `${BASE_API_URL}/api/v1/media/${postID}_${userID}/unlike/`,
      undefined,
      options,
    );
    return res.data.status === 'ok';
  };
  follow = async (userID: string, options?: AxiosRequestConfig) => {
    const res = await this._toggleAuthPostRequest<FriendshipStatusResponse>(
      `${BASE_API_URL}/api/v1/friendships/create/${userID}/`,
      undefined,
      options,
    );
    if (this.verbose) {
      console.debug('[FOLLOW]', res.data);
    }
    return res.data;
  };
  unfollow = async (userID: string, options?: AxiosRequestConfig) => {
    const res = await this._toggleAuthPostRequest<FriendshipStatusResponse>(
      `${BASE_API_URL}/api/v1/friendships/destroy/${userID}/`,
      undefined,
      options,
    );
    if (this.verbose) {
      console.debug('[UNFOLLOW]', res.data);
    }
    return res.data;
  };
  repost = async (postID: string, options?: AxiosRequestConfig) => {
    const res = await this._toggleAuthPostRequest<FriendshipStatusResponse>(
      `${BASE_API_URL}api/v1/repost/create_repost/`,
      { media_id: postID },
      options,
    );
    if (this.verbose) {
      console.debug('[REPOST]', res.data);
    }
    return res.data;
  };
  unrepost = async (originalPostID: string, options?: AxiosRequestConfig) => {
    const res = await this._toggleAuthPostRequest<FriendshipStatusResponse>(
      `${BASE_API_URL}/api/v1/repost/delete_text_app_repost/`,
      { original_media_id: originalPostID },
      options,
    );
    if (this.verbose) {
      console.debug('[UNREPOST]', res.data);
    }
    return res.data;
  };

  getToken = async (): Promise<string | undefined> => {
    if (this.token) {
      if (this.verbose) {
        console.debug('[token] USING', this.token);
      }
      return this.token;
    }

    if (!this.username || !this.password) {
      throw new Error('Username and password are required');
    }
    await this.login();
    return this.token;
  };

  publish = async (rawOptions: ThreadsAPIPublishOptions | string): Promise<string | undefined> => {
    const options: ThreadsAPIPublishOptions =
      typeof rawOptions === 'string' ? { text: rawOptions } : rawOptions;
    if (!this.token && (!this.username || !this.password)) {
      throw new Error('Username or password not set');
    }

    const userID = await this.getCurrentUserID();
    if (!userID) {
      throw new Error('User ID not found');
    }

    const token = await this.getToken();
    if (!token) {
      throw new Error('Token not found');
    }

    const now = new Date();
    const timezoneOffset = -now.getTimezoneOffset() * 60;

    let data: any = {
      text_post_app_info: { reply_control: 0 },
      timezone_offset: timezoneOffset.toString(),
      source_type: '4',
      _uid: userID,
      device_id: this.deviceID,
      caption: options.text || '',
      upload_id: now.getTime(),
      device: this.device,
    };
    let url = POST_URL;

    if ('image' in options && !!options.image) {
      url = POST_WITH_IMAGE_URL;
      data.upload_id = (await this.uploadImage(options.image)).upload_id;
      data.scene_capture_type = '';
    } else if ('url' in options && !!options.url) {
      data.text_post_app_info.link_attachment_url = options.url;
    }

    if (!!options.parentPostID) {
      data.text_post_app_info.reply_id = options.parentPostID;
    }
    if (!(options as any).image) {
      data.publish_mode = 'text_post';
    }

    const payload = `signed_body=SIGNATURE.${encodeURIComponent(JSON.stringify(data))}`;
    const res = await axios.post(url, payload, {
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      headers: this._getAppHeaders(),
      timeout: 60 * 1000,
    });

    if (this.verbose) {
      console.debug('[PUBLISH]', res.data);
    }

    if (res.data['status'] === 'ok') {
      return res.data['media']['id'];
    }

    return undefined;
  };

  delete = async (postID: string, options?: AxiosRequestConfig): Promise<boolean> => {
    const url = `${BASE_API_URL}/api/v1/media/${postID}/delete/`;
    const data = {
      media_id: postID,
      _uid: this.userID,
      _uuid: this.deviceID,
    };
    const payload = `signed_body=SIGNATURE.${encodeURIComponent(JSON.stringify(data))}`;

    const res = await axios.post(url, payload, {
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      headers: this._getAppHeaders(),
      timeout: 60 * 1000,
      ...options,
    });
    if (res.data['status'] === 'ok') {
      return true;
    }
    return false;
  };

  /**
   * @deprecated: use `publish` instead
   **/
  publishWithImage = async (caption: string, imagePath: string): Promise<string | undefined> => {
    return this.publish({ text: caption, image: imagePath });
  };

  uploadImage = async (image: string | ThreadsAPIImage): Promise<InstagramImageUploadResponse> => {
    const uploadID = Date.now().toString();
    const name = `${uploadID}_0_${Math.floor(Math.random() * (9999999999 - 1000000000 + 1) + 1000000000)}`;
    const url: string = `https://www.instagram.com/rupload_igphoto/${name}`;

    let content: Buffer;
    let mime_type: string | null;

    if (typeof image === 'string' || 'path' in image) {
      const imagePath = typeof image === 'string' ? image : image.path;
      const isFilePath = !imagePath.startsWith('http');
      if (isFilePath) {
        const fs = await import('fs');
        content = await fs.promises.readFile(imagePath);
        const mimeTypeResult = mimeTypes.lookup(imagePath);
        mime_type = mimeTypeResult ? mimeTypeResult : 'application/octet-stream';
      } else {
        const response = await axios.get(imagePath, { responseType: 'arraybuffer' });
        content = Buffer.from(response.data, 'binary');
        mime_type = response.headers['content-type'];
      }
    } else {
      content = image.data;
      const mimeTypeResult = image.type.includes('/') ? image.type : mimeTypes.lookup(image.type);
      mime_type = mimeTypeResult ? mimeTypeResult : 'application/octet-stream';
    }

    const x_instagram_rupload_params = {
      upload_id: uploadID,
      media_type: '1',
      sticker_burnin_params: JSON.stringify([]),
      image_compression: JSON.stringify({ lib_name: 'moz', lib_version: '3.1.m', quality: '80' }),
      xsharing_user_ids: JSON.stringify([]),
      retry_context: JSON.stringify({
        num_step_auto_retry: '0',
        num_reupload: '0',
        num_step_manual_retry: '0',
      }),
      'IG-FB-Xpost-entry-point-v2': 'feed',
    };

    const contentLength = content.length;
    const imageHeaders: any = {
      ...this._getDefaultHeaders(),
      'Content-Type': 'application/octet-stream',
      X_FB_PHOTO_WATERFALL_ID: uuidv4(),
      'X-Entity-Type': mime_type!! !== undefined ? `image/${mime_type!!}` : 'image/jpeg',
      Offset: '0',
      'X-Instagram-Rupload-Params': JSON.stringify(x_instagram_rupload_params),
      'X-Entity-Name': name,
      'X-Entity-Length': contentLength.toString(),
      'Content-Length': contentLength.toString(),
      'Accept-Encoding': 'gzip',
    };

    if (this.verbose) {
      console.log(`[UPLOAD_IMAGE] Uploading ${contentLength.toLocaleString()}b as ${uploadID}...`);
    }

    try {
      const { data } = await axios.post<InstagramImageUploadResponse>(url, content, {
        httpAgent: this.httpAgent,
        headers: imageHeaders,
        timeout: 60 * 1000,
      });
      if (this.verbose) {
        console.log(`[UPLOAD_IMAGE] SUCCESS`, data);
      }
      return data;
    } catch (error: any) {
      if (this.verbose) {
        console.log(`[UPLOAD_IMAGE] FAILED`, error.response.data);
      }
      throw Error('Upload image failed');
    }
  };
}
