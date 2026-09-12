declare module 'react-native-vector-icons/Ionicons' {
  import { Component } from 'react';
  import { IconProps } from 'react-native-vector-icons/Icon';
  export default class Ionicons extends Component<IconProps, any> {}
}

declare module '*.png' {
  const value: any;
  export default value;
}

declare module '*.jpg' {
  const value: any;
  export default value;
}

